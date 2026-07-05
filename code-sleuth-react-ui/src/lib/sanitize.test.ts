import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml — XSS defense (sole barrier for AI-generated HTML)", () => {
  const xssPayloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<img src=x onerror="alert(document.cookie)">',
    '<a href="javascript:alert(1)">click</a>',
    "<svg/onload=alert(1)>",
    '<iframe src="javascript:alert(1)"></iframe>',
    '<div onclick="alert(1)">x</div>',
    "<style>@import 'https://evil.example/x.css'</style>",
    '<object data="data:text/html,<script>alert(1)</script>"></object>',
    '"><script>alert(document.cookie)</script>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    "<form action=javascript:alert(1)><button>go</button></form>",
    "<math><mtext><script>alert(1)</script></mtext></math>",
    "<body onload=alert(1)>",
    "<input autofocus onfocus=alert(1)>",
  ];

  it.each(xssPayloads)("neutralizes: %s", (payload) => {
    const out = sanitizeHtml(payload);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/\son\w+\s*=/i); // no inline event handlers
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/<iframe|<object|<embed|<form|<input|<style/i);
    expect(out.toLowerCase()).not.toContain("alert(1)"); // no executable payload survives in an attribute/URL
  });

  it("preserves safe formatting/markdown output", () => {
    const out = sanitizeHtml(
      '<h2>Report</h2><p>Hello <strong>world</strong> and <em>code</em></p>' +
        '<ul><li>one</li></ul><pre><code>x = 1</code></pre>' +
        '<a href="https://example.com/path">link</a>',
    );
    expect(out).toMatch(/<strong>world<\/strong>/);
    expect(out).toMatch(/<code>x = 1<\/code>/);
    expect(out).toMatch(/href="https:\/\/example\.com\/path"/);
  });

  it("hardens surviving links (target/rel)", () => {
    const out = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(out).toMatch(/target="_blank"/);
  });

  it("returns empty string for nullish input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
  });
});
