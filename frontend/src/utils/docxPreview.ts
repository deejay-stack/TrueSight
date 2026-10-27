import DOMPurify from "dompurify";

/** Allow document structure, never uploaded scripts, styles, links or remote images. */
export const sanitizeDocumentHtml = (html: string): string => {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "strong", "b", "em", "i", "u", "s", "sup", "sub", "ul", "ol", "li", "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "img", "span"],
    ALLOWED_ATTR: ["src", "alt", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const image of fragment.querySelectorAll("img")) {
    if (!/^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(image.getAttribute("src") ?? "")) image.remove();
  }
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
};
