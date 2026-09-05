/**
 * A deliberately small source tokenizer for the plates.
 *
 * The design prints code in one ink with two typographic accents: keywords in
 * SemiBold and comments in Italic (strings take the soft ink). That is all
 * this does — no scopes, no themes — so it stays fast enough to run on every
 * keystroke over a 2 MB paste and safe (tokens are rendered as React text,
 * never as HTML).
 */

export type TokenKind = "kw" | "comment" | "string" | "plain";
export interface Token {
  kind: TokenKind;
  text: string;
}

const C_LIKE = ["if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return", "new", "this", "null", "true", "false", "try", "catch", "finally", "throw", "class", "static", "void", "int", "long", "float", "double", "char", "bool", "boolean", "const", "let", "var", "function", "import", "export", "from", "extends", "implements", "interface", "enum", "public", "private", "protected", "async", "await", "yield", "typeof", "instanceof", "in", "of", "super", "package", "struct", "typedef", "sizeof", "unsigned", "signed", "short", "goto", "extern", "volatile", "register", "union", "namespace", "using", "template", "typename", "final", "abstract", "synchronized", "throws", "type", "readonly", "declare", "keyof", "never", "unknown", "any", "string", "number", "undefined"];

const KEYWORDS: Record<string, readonly string[]> = {
  python: ["def", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "import", "from", "as", "class", "try", "except", "finally", "with", "lambda", "yield", "pass", "break", "continue", "raise", "global", "nonlocal", "assert", "del", "is", "None", "True", "False", "async", "await", "print"],
  javascript: C_LIKE,
  typescript: C_LIKE,
  java: C_LIKE,
  c: C_LIKE,
  kotlin: [...C_LIKE, "fun", "val", "when", "object", "data", "override", "open", "sealed", "companion", "is", "as", "lateinit", "init", "suspend"],
  scala: [...C_LIKE, "def", "val", "object", "trait", "match", "with", "sealed", "override", "implicit", "lazy", "yield"],
  go: ["func", "return", "if", "else", "for", "range", "switch", "case", "default", "break", "continue", "package", "import", "type", "struct", "interface", "map", "chan", "go", "defer", "select", "var", "const", "nil", "true", "false", "fallthrough", "goto"],
  rust: ["fn", "let", "mut", "return", "if", "else", "for", "while", "loop", "match", "in", "impl", "struct", "enum", "trait", "pub", "use", "mod", "crate", "self", "Self", "super", "as", "where", "type", "const", "static", "ref", "move", "async", "await", "dyn", "unsafe", "true", "false", "break", "continue", "extern"],
  ruby: ["def", "end", "return", "if", "elsif", "else", "unless", "while", "until", "for", "in", "do", "case", "when", "then", "class", "module", "begin", "rescue", "ensure", "yield", "self", "nil", "true", "false", "and", "or", "not", "require", "attr_accessor", "puts", "lambda", "proc", "super", "raise", "break", "next", "redo", "retry"],
  php: [...C_LIKE, "echo", "function", "elseif", "foreach", "as", "endif", "endforeach", "require", "include", "require_once", "include_once", "namespace", "use", "fn", "match", "isset", "unset", "empty", "array"],
  r: ["function", "return", "if", "else", "for", "while", "repeat", "in", "next", "break", "TRUE", "FALSE", "NULL", "NA", "Inf", "NaN", "library", "require"],
  elixir: ["def", "defp", "defmodule", "do", "end", "if", "else", "unless", "case", "cond", "when", "fn", "true", "false", "nil", "and", "or", "not", "in", "with", "receive", "after", "raise", "try", "rescue", "catch", "import", "alias", "use", "require", "quote", "unquote"],
  haskell: ["module", "where", "import", "qualified", "as", "hiding", "data", "type", "newtype", "class", "instance", "deriving", "let", "in", "if", "then", "else", "case", "of", "do", "forall", "infix", "infixl", "infixr"],
  perl: ["my", "our", "local", "sub", "return", "if", "elsif", "else", "unless", "while", "until", "for", "foreach", "last", "next", "redo", "use", "no", "package", "require", "print", "die", "eval", "and", "or", "not", "shift", "defined", "undef"],
};

type CommentStyle = { line: readonly string[]; blockOpen?: string; blockClose?: string };

const COMMENTS: Record<string, CommentStyle> = {
  python: { line: ["#"], blockOpen: '"""', blockClose: '"""' },
  ruby: { line: ["#"], blockOpen: "=begin", blockClose: "=end" },
  r: { line: ["#"] },
  perl: { line: ["#"] },
  elixir: { line: ["#"] },
  haskell: { line: ["--"], blockOpen: "{-", blockClose: "-}" },
  php: { line: ["//", "#"], blockOpen: "/*", blockClose: "*/" },
};
const C_COMMENTS: CommentStyle = { line: ["//"], blockOpen: "/*", blockClose: "*/" };

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$']*/y;

function tokenizeLine(line: string, keywords: Set<string>, comments: CommentStyle, inBlock: boolean): { tokens: Token[]; inBlock: boolean } {
  const tokens: Token[] = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      tokens.push({ kind: "plain", text: plain });
      plain = "";
    }
  };

  while (i < line.length) {
    if (inBlock) {
      const close = comments.blockClose ? line.indexOf(comments.blockClose, i) : -1;
      if (close === -1) {
        flush();
        tokens.push({ kind: "comment", text: line.slice(i) });
        return { tokens, inBlock: true };
      }
      flush();
      tokens.push({ kind: "comment", text: line.slice(i, close + comments.blockClose!.length) });
      i = close + comments.blockClose!.length;
      inBlock = false;
      continue;
    }

    const rest = line.slice(i);

    if (comments.blockOpen && rest.startsWith(comments.blockOpen)) {
      const close = line.indexOf(comments.blockClose!, i + comments.blockOpen.length);
      flush();
      if (close === -1) {
        tokens.push({ kind: "comment", text: rest });
        return { tokens, inBlock: true };
      }
      tokens.push({ kind: "comment", text: line.slice(i, close + comments.blockClose!.length) });
      i = close + comments.blockClose!.length;
      continue;
    }

    if (comments.line.some((marker) => rest.startsWith(marker))) {
      flush();
      tokens.push({ kind: "comment", text: rest });
      return { tokens, inBlock: false };
    }

    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) {
        if (line[j] === "\\") j += 1;
        j += 1;
      }
      flush();
      tokens.push({ kind: "string", text: line.slice(i, Math.min(j + 1, line.length)) });
      i = j + 1;
      continue;
    }

    IDENT_RE.lastIndex = i;
    const m = IDENT_RE.exec(line);
    if (m && m.index === i) {
      const word = m[0];
      if (keywords.has(word)) {
        flush();
        tokens.push({ kind: "kw", text: word });
      } else {
        plain += word;
      }
      i += word.length;
      continue;
    }

    plain += ch;
    i += 1;
  }
  flush();
  return { tokens, inBlock };
}

const keywordCache = new Map<string, Set<string>>();

/** Tokenize a whole source into lines of tokens. Unknown languages get the C-like set. */
export function highlightSource(code: string, language: string): Token[][] {
  const lang = (language || "").toLowerCase();
  let keywords = keywordCache.get(lang);
  if (!keywords) {
    keywords = new Set(KEYWORDS[lang] ?? C_LIKE);
    keywordCache.set(lang, keywords);
  }
  const comments = COMMENTS[lang] ?? C_COMMENTS;
  const lines = code.split("\n");
  const out: Token[][] = [];
  let inBlock = false;
  for (const line of lines) {
    const r = tokenizeLine(line, keywords, comments, inBlock);
    out.push(r.tokens);
    inBlock = r.inBlock;
  }
  return out;
}

/** Human byte count in the plate's mono voice: 402 B · 1.3 KB · 2 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
