// A small XML 1.0 well-formedness checker for the generated OOXML parts. Not a general parser: it accepts exactly the constructs the
// export writers produce (declaration, elements with double-quoted attributes, text, entities) and rejects everything else, so a
// stray "<", a bare "&", an illegal character, an unbalanced tag or a duplicate attribute fails loudly.

const NAME = "[A-Za-z_][\\w.:-]*";
const ENTITY = /&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/g;
const ILLEGAL_CHARS = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;

export function decodeUtf8Strict(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

function isXmlChar(codePoint: number): boolean {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd || (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function checkEscapes(s: string, where: string): void {
  const rest = s.replace(ENTITY, (entity) => {
    if (entity.startsWith("&#")) {
      const hex = entity[2] === "x";
      const code = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      if (!isXmlChar(code)) throw new Error(`${where}: character reference ${entity} is not a legal XML character`);
    }
    return "";
  });
  if (rest.includes("&")) throw new Error(`${where}: bare "&" in ${JSON.stringify(s)}`);
  if (rest.includes("<")) throw new Error(`${where}: bare "<" in ${JSON.stringify(s)}`);
}

/** Throws unless `xml` is well formed (single root element, balanced tags, valid escapes, legal characters). Returns the root name. */
export function assertWellFormedXml(xml: string, label = "xml"): string {
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  if (!xml.startsWith(declaration)) throw new Error(`${label}: missing or unexpected XML declaration`);
  if (ILLEGAL_CHARS.test(xml)) throw new Error(`${label}: contains a character that XML 1.0 forbids`);

  const token = new RegExp(`<(/)?(${NAME})((?:\\s+${NAME}="[^"]*")*)\\s*(/)?>|<[^>]*>?|[^<]+`, "gy");
  const stack: string[] = [];
  let root: string | null = null;
  let done = false;
  token.lastIndex = declaration.length;
  let m: RegExpExecArray | null;
  while (token.lastIndex < xml.length && (m = token.exec(xml))) {
    const [raw, closing, name, attributes, selfClosing] = m;
    if (!raw.startsWith("<")) {
      if (stack.length === 0) {
        if (raw.trim() !== "") throw new Error(`${label}: text outside the root element: ${JSON.stringify(raw.slice(0, 40))}`);
      } else {
        if (raw.includes("]]>")) throw new Error(`${label}: "]]>" in text`);
        checkEscapes(raw, label);
      }
      continue;
    }
    if (name === undefined) throw new Error(`${label}: malformed markup ${JSON.stringify(raw.slice(0, 60))}`);
    if (done) throw new Error(`${label}: content after the root element`);
    if (closing) {
      if (stack.pop() !== name) throw new Error(`${label}: unbalanced </${name}>`);
      if (stack.length === 0) done = true;
      continue;
    }
    const seen = new Set<string>();
    for (const attribute of attributes.matchAll(new RegExp(`(${NAME})="([^"]*)"`, "g"))) {
      if (seen.has(attribute[1])) throw new Error(`${label}: duplicate attribute ${attribute[1]} on <${name}>`);
      seen.add(attribute[1]);
      checkEscapes(attribute[2], `${label} <${name} ${attribute[1]}>`);
    }
    if (root === null) root = name;
    if (selfClosing) {
      if (stack.length === 0) done = true;
    } else {
      stack.push(name);
    }
  }
  if (token.lastIndex < xml.length) throw new Error(`${label}: could not read the markup at offset ${token.lastIndex}`);
  if (stack.length > 0) throw new Error(`${label}: <${stack[stack.length - 1]}> is never closed`);
  if (root === null) throw new Error(`${label}: no root element`);
  return root;
}

/** Decodes the character and entity references of a text node or attribute value. */
export function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/g, (_all, body: string) => {
    switch (body) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return '"';
      case "apos": return "'";
      default: return String.fromCodePoint(body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10));
    }
  });
}

/** What a spreadsheet application shows for an OOXML string: "_xHHHH_" is an escape for the UTF-16 unit HHHH (read leniently: "_X" too). */
export function decodeSpreadsheetEscapes(s: string): string {
  return s.replace(/_[xX]([0-9A-Fa-f]{4})_/g, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
