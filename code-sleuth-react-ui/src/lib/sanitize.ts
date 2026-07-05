import DOMPurify from "dompurify";

/**
 * The application's single XSS defense for server/AI-generated HTML that is
 * injected via `dangerouslySetInnerHTML` (the analysis report and history
 * views). The analysis pipeline renders Markdown to HTML on the server, so we
 * allow common formatting/code/table tags but strip anything executable.
 *
 * DOMPurify already removes <script>, inline event handlers (on*), and
 * `javascript:`/`data:` script URLs by default; the explicit allowlist below
 * narrows the surface further and the hook hardens outbound links.
 */

const ALLOWED_TAGS = [
  "a", "b", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4",
  "h5", "h6", "hr", "i", "li", "ol", "p", "pre", "span", "strong", "sub",
  "sup", "table", "tbody", "td", "th", "thead", "tr", "ul",
];

const ALLOWED_ATTR = ["href", "title", "class", "colspan", "rowspan", "align"];

let hookRegistered = false;

function registerHook(): void {
  if (hookRegistered) return;
  hookRegistered = true;
  // Force every surviving <a> to be a safe, non-referring, new-tab link.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

/**
 * Return a sanitized copy of `html` safe to inject with
 * `dangerouslySetInnerHTML`. Never returns undefined.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  registerHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Only permit http(s)/mailto/relative link targets; block javascript:, etc.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["style", "srcset", "formaction", "action"],
    ALLOW_DATA_ATTR: false,
  });
}

export default sanitizeHtml;
