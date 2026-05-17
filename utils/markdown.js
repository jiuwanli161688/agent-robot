import { marked } from "marked";

const markdownRenderer = new marked.Renderer();

markdownRenderer.paragraph = function (token) {
  const text = this.parser.parseInline(token?.tokens || []);
  return `<p style="margin:0 0 14rpx;line-height:1.8;color:#1f2937;">${text}</p>`;
};

markdownRenderer.strong = function ({ tokens }) {
  const text = this.parser.parseInline(tokens);
  return `<strong style="font-weight:700;color:#111827;">${text}</strong>`;
};

markdownRenderer.em = function ({ tokens }) {
  const text = this.parser.parseInline(tokens);
  return `<em style="font-style:italic;">${text}</em>`;
};

markdownRenderer.codespan = ({ text }) =>
  `<code style="padding:4rpx 8rpx;border-radius:8rpx;background:#eef2ff;color:#4f46e5;font-size:24rpx;">${text}</code>`;

markdownRenderer.code = ({ text }) =>
  `<pre style="margin:10rpx 0;padding:16rpx;border-radius:12rpx;background:#0f172a;overflow:auto;"><code style="color:#e2e8f0;font-size:24rpx;line-height:1.7;">${text}</code></pre>`;

markdownRenderer.blockquote = function ({ tokens }) {
  const quote = this.parser.parse(tokens);
  return `<blockquote style="margin:10rpx 0;padding:0 0 0 16rpx;border-left:6rpx solid #60a5fa;color:#475569;">${quote}</blockquote>`;
};

markdownRenderer.list = function ({ items, ordered }) {
  const body = (items || []).map((item) => this.listitem(item)).join("");
  const tag = ordered ? "ol" : "ul";
  return `<${tag} style="margin:0 0 14rpx;padding-left:30rpx;line-height:1.8;color:#1f2937;">${body}</${tag}>`;
};

markdownRenderer.listitem = function (item) {
  const tokens = item?.tokens || [];
  if (tokens.length === 1 && tokens[0]?.type === "paragraph") {
    const text = this.parser.parseInline(tokens[0]?.tokens || []);
    return `<li style="margin:0 0 6rpx;">${text}</li>`;
  }
  const html = this.parser.parse(tokens);
  return `<li style="margin:0 0 6rpx;">${html}</li>`;
};

markdownRenderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const sizes = { 1: "36rpx", 2: "32rpx", 3: "30rpx", 4: "28rpx", 5: "26rpx", 6: "24rpx" };
  return `<h${depth} style="margin:8rpx 0 14rpx;font-size:${sizes[depth] || "24rpx"};font-weight:700;color:#0f172a;line-height:1.5;">${text}</h${depth}>`;
};

markdownRenderer.link = function ({ href, title, tokens }) {
  const text = this.parser.parseInline(tokens);
  return `<a href="${href || "#"}" title="${title || ""}" style="color:#2563eb;text-decoration:underline;">${text}</a>`;
};

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer: markdownRenderer,
});

const sanitizeHtml = (html) => {
  if (!html) return "";
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\{[^}]*\}/gi, "")
    .replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
};

const escapeHtml = (raw) =>
  String(raw || "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));

export const renderMarkdown = (content) => {
  const raw = typeof content === "string" ? content : "";
  try {
    const html = marked.parse(raw || "...");
    return sanitizeHtml(typeof html === "string" ? html : "");
  } catch (error) {
    const fallback = escapeHtml(raw);
    return `<pre style="margin:10rpx 0;padding:16rpx;border-radius:12rpx;background:#f1f5f9;overflow:auto;"><code style="color:#0f172a;font-size:24rpx;line-height:1.7;">${fallback}</code></pre>`;
  }
};
