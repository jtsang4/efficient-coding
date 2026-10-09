import DOMPurify from "dompurify";
import { Marked } from "marked";

const marked = new Marked({ gfm: true, breaks: false });

// Agent replies and summaries are untrusted text: render GFM, then sanitize.
export function renderMarkdown(src) {
  return DOMPurify.sanitize(marked.parse(src, { async: false }), { USE_PROFILES: { html: true } });
}

/** Summary text for tooltips: drop Markdown syntax but keep every literal character (`_`, `<`, `>`). */
export const plainText = (src) =>
  src
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
