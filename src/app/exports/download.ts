// Saving a generated file from the browser. Nothing here touches the DOM at import time, so the module can be imported (and
// sanitizeFileName tested) under Node; saveBlob needs a real document.

const MAX_NAME = 150;
const REVOKE_DELAY_MS = 1000;
const DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\s*(?:\.|$))/i;

const trimEnds = (s: string) => s.replace(/^[.\s]+|[.\s]+$/g, "");

/**
 * Makes a safe download name: drops path separators, control characters and unpaired surrogates, turns the other characters Windows
 * rejects (< > : " | ? *) into "-", collapses whitespace, trims leading and trailing dots and spaces, prefixes "_" to Windows device
 * names (CON, NUL, COM1...), and caps the length at 150 characters (never splitting a surrogate pair) while keeping the extension.
 * Falls back to `fallback` when nothing is left.
 */
export function sanitizeFileName(name: string, fallback = "download"): string {
  let s = trimEnds(
    String(name ?? "")
      .replace(/[\\/\u0000-\u001f\u007f-\u009f\ud800-\udfff]/gu, "")
      .replace(/[<>:"|?*]/g, "-")
      .replace(/\s+/g, " "),
  );
  if (s === "") return fallback === "download" ? fallback : sanitizeFileName(fallback);
  if (DEVICE_NAME.test(s)) s = `_${s}`;
  if (s.length > MAX_NAME) {
    const dot = s.lastIndexOf(".");
    const extension = dot > 0 && s.length - dot <= 12 ? s.slice(dot) : "";
    s = trimEnds(s.slice(0, MAX_NAME - extension.length).replace(/[\ud800-\udfff]/gu, "")) + extension;
  }
  return s;
}

/** Offers the blob to the user as a download (an invisible anchor with the `download` attribute, then the object URL is released). */
export function saveBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizeFileName(fileName);
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}
