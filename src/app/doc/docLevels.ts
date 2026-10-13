/** Heading levels the DocView can emit: h2..h6. */
export type Level = 2 | 3 | 4 | 5 | 6;

export const clampLevel = (n: number): Level => Math.min(6, Math.max(2, n)) as Level;

/**
 * The heading level of the section each block sits in. The document title is at `titleLevel`; a level-2 heading block opens a section one
 * level below it and a level-3 block one more; every other block belongs to the section above it. Block titles nest one level deeper.
 */
export function sectionLevels(blocks: ReadonlyArray<{ kind: string; level?: number }>, titleLevel: number): number[] {
  const levels: number[] = [];
  let section = titleLevel;
  for (const block of blocks) {
    if (block.kind === "heading") section = titleLevel + (block.level ?? 2) - 1;
    levels.push(section);
  }
  return levels;
}
