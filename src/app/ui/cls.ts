export type ClassPart = string | false | null | undefined;

/** Joins class names, skipping falsy parts. */
export function cls(...parts: ClassPart[]): string {
  return parts.filter(Boolean).join(" ");
}
