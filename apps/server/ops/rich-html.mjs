// 富文本公用:白名单 sanitize(防存储型 XSS)+ 纯文本派生 + 空判断 + 大小上限。
// 提单正文(content_html)、项目备注(remark)等富文本字段共用。
import sanitizeHtml from "sanitize-html";

export const MAX_CONTENT_HTML = 8_000_000; // ~8MB,给 base64 内联图片留空间(列为 MEDIUMTEXT 16MB)

const SANITIZE_OPTS = {
  allowedTags: ["p", "br", "span", "strong", "b", "em", "i", "u", "s", "strike", "del", "mark", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "h4", "a", "img", "video", "hr"],
  allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt", "title"], video: ["src", "controls", "width", "height", "poster"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] }, // 允许图片用 data: base64
  nonTextTags: ["script", "style", "noscript", "textarea"], // 连同标签内文本一并丢弃
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }) },
};

export const sanitizeRichHtml = (html) => sanitizeHtml(String(html ?? ""), SANITIZE_OPTS).trim();

export function htmlToPlain(html) {
  return String(html ?? "")
    .replace(/<\s*(br|\/p|\/li|\/h[1-6]|\/div)\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export const isBlankRich = (html) => (html ? (/<img/i.test(html) ? false : htmlToPlain(html) === "") : true);
