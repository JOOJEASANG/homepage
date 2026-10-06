// Sanitize stored editor HTML before inserting it into a live document.
const TAGS = new Set(['P','DIV','SPAN','BR','B','STRONG','I','EM','U','S','STRIKE','FONT','UL','OL','LI','A','IMG','HR','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','TABLE','THEAD','TBODY','TR','TH','TD']);
const STYLES = new Set(['color','background-color','font-size','font-weight','font-style','font-family','text-align','text-decoration','line-height','width','height','max-width','border','border-color','border-width','border-style','border-collapse','padding','margin']);

export function sanitizeRichText(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  for (const el of [...template.content.querySelectorAll('*')].reverse()) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !TAGS.has(el.tagName)) {
      if (['SCRIPT','STYLE','IFRAME','OBJECT','TEMPLATE','SVG','MATH'].includes(el.tagName.toUpperCase())) el.remove();
      else el.replaceWith(...el.childNodes);
      continue;
    }
    const style = document.createElement('span').style;
    for (const property of Array.from(el.style)) {
      const value = el.style.getPropertyValue(property);
      if (STYLES.has(property) && !/url\s*\(|expression\s*\(|@import/i.test(value)) style.setProperty(property, value);
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const presentation = ['title','alt','width','height','colspan','rowspan'].includes(name)
        || (el.tagName === 'FONT' && ['color','face','size'].includes(name));
      if (presentation) continue;
      if ((el.tagName === 'A' && name === 'href') || (el.tagName === 'IMG' && name === 'src')) {
        try {
          const url = new URL(attr.value, location.href);
          const protocols = el.tagName === 'A' ? ['https:','http:','mailto:','tel:'] : ['https:','http:'];
          if (protocols.includes(url.protocol)) continue;
        } catch (_) {}
      }
      el.removeAttribute(attr.name);
    }
    if (style.cssText) el.setAttribute('style', style.cssText);
    if (el.tagName === 'A') { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
    if (el.tagName === 'IMG') {
      if (!el.hasAttribute('src')) el.remove();
      else { el.loading = 'lazy'; el.decoding = 'async'; }
    }
  }
  return template.innerHTML;
}
