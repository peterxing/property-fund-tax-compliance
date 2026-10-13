import type { SankeyModel } from "../../domain/types.ts";
import { SANKEY_DEFAULTS, nodeValues, shareText, withShare } from "./sankeyLayout.ts";

// The Sankey's labels are drawn as SVG text, which never wraps and is cut off at the edge of the chart, so the chart has to reserve room for the
// words it will draw. This file works out how much room each side needs from the text itself: it estimates how wide each label is, gives the
// margins what the labels need (never less than the chart's usual room), and when the chart is too narrow for that it first breaks the names onto
// further lines, then stacks the amounts under the names, then steps the type down, and only as a last resort ends a name with an ellipsis.
// Everything here is pure; SankeyChart draws the plan and layoutSankey is told how tall each label is.

/** Label type in px: the chart starts at `size`, and steps down by `step` to no smaller than `min` only when wrapping cannot make the labels fit. */
export const LABEL_TYPE = { size: 12.5, min: 11, step: 0.5 } as const;
/** Line height of a label, as a multiple of its font size. */
export const LABEL_LINE_EM = 1.25;
/** Space between a node and its label, in px. */
export const LABEL_GAP = 8;
/** Space between a source's name and its amount when they share a line, in px. */
export const VALUE_GAP = 6;

/** The most lines a name is broken onto. */
const MAX_NAME_LINES = 3;
/** The ribbons keep at least this much room between the two columns of nodes: the larger of the px and the share of the chart width. Only when even the smallest type does not fit is it tightened. */
const SPAN = { min: 112, share: 0.3, tightMin: 72, tightShare: 0.2 } as const;
/** Smallest margin the squeeze of last resort leaves a side, in px. */
const LEAST_MARGIN = 48;
/** Below this chart width the source labels always stack the amount under the name. */
const NARROW = 620;

// Advance widths of ' ' to '~' (95 characters) in Geist Variable at weight 600, in hundredths of an em, each rounded up. Every digit gets the widest
// digit's width, as the amounts use tabular figures. Adding advances ignores kerning, which can only shorten a line, and the regular weight the
// amounts are set in is a little narrower than 600, so an estimate is never short of what the browser draws.
const ADVANCE = [
  24, 25, 38, 56, 66, 82, 68, 20, 31, 31, 43, 57, 23, 42, 23, 51, // ' ' to '/'
  69, 69, 69, 69, 69, 69, 69, 69, 69, 69, // '0' to '9'
  31, 31, 55, 55, 55, 59, 95, // ':' to '@'
  71, 70, 73, 71, 62, 60, 73, 72, 29, 62, 68, 59, 91, 75, 77, 67, 76, 69, 67, 59, 70, 71, 100, 66, 62, 58, // 'A' to 'Z'
  38, 49, 38, 45, 56, 27, // '[' to '`'
  58, 63, 58, 63, 60, 43, 63, 61, 27, 31, 63, 30, 90, 61, 61, 63, 63, 41, 56, 43, 60, 59, 84, 63, 57, 57, // 'a' to 'z'
  41, 29, 41, 53, // '{' to '~'
] as const;
const OTHER_ADVANCE: Readonly<Record<string, number>> = { "—": 0.92, "–": 0.6, "·": 0.23, "…": 0.66, "’": 0.24, "×": 0.53, "\u00a0": 0.24 };
const UNKNOWN_ADVANCE = 0.75;

/** How wide `text` is when drawn at `fontSize` px: an estimate that errs on the wide side (see ADVANCE). */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    em += code >= 32 && code <= 126 ? ADVANCE[code - 32]! / 100 : (OTHER_ADVANCE[ch] ?? UNKNOWN_ADVANCE);
  }
  return em * fontSize;
}

/** The words of a label. A dash stays with the word before it and an ampersand with the word after it, so a line never starts with a dash or ends with "&". */
export function labelWords(text: string): string[] {
  const out: string[] = [];
  let prefix = "";
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    if ((token === "—" || token === "–") && out.length > 0) out[out.length - 1] += ` ${token}`;
    else if (token === "&") prefix = "& ";
    else {
      out.push(prefix + token);
      prefix = "";
    }
  }
  if (prefix) out.push(prefix.trim());
  return out;
}

/** `text` cut short with an ellipsis so that it is no wider than `maxWidth` (unchanged when it already fits). */
export function ellipsize(text: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && estimateTextWidth(`${chars.join("").trimEnd()}…`, fontSize) > maxWidth) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}

function breakWord(word: string, maxWidth: number, fontSize: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const ch of word) {
    if (piece && estimateTextWidth(piece + ch, fontSize) > maxWidth) {
      pieces.push(piece);
      piece = ch;
    } else piece += ch;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

export interface WrappedText {
  lines: string[];
  /** The text could not be wrapped to fit: a word is wider than the line, or it needs more than `maxLines` lines. */
  overflow: boolean;
  /** `force` cut the end of the text off with an ellipsis. */
  truncated: boolean;
}

/**
 * Breaks `text` at spaces into lines no wider than `maxWidth`, at most `maxLines` of them. When that is not possible `overflow` is set and the
 * lines are only a best effort; with `force` a word that is too wide is broken where the line is full and what does not fit in `maxLines` is cut
 * off with an ellipsis, so the result always fits.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number, force = false): WrappedText {
  const limit = Math.max(0, maxWidth);
  const fits = (t: string): boolean => estimateTextWidth(t, fontSize) <= limit;
  let lines: string[] = [];
  let line = "";
  let overflow = false;
  for (const word of labelWords(text)) {
    const joined = line ? `${line} ${word}` : word;
    if (fits(joined)) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    if (fits(word)) {
      line = word;
      continue;
    }
    overflow = true;
    if (!force) {
      line = word;
      continue;
    }
    const pieces = breakWord(word, limit, fontSize);
    lines.push(...pieces.slice(0, -1));
    line = pieces[pieces.length - 1] ?? "";
  }
  if (line || lines.length === 0) lines.push(line);

  let truncated = false;
  if (lines.length > maxLines) {
    overflow = true;
    if (force) {
      const rest = lines.slice(maxLines - 1).join(" ");
      lines = [...lines.slice(0, maxLines - 1), ellipsize(rest, limit, fontSize)];
      truncated = true;
    }
  }
  return { lines, overflow, truncated };
}

/** What a chart of this width gives each side when the labels are short: the room the chart has always had. */
export function baseMargins(width: number): { labelLeft: number; labelRight: number; compact: boolean } {
  const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
  const compact = width < NARROW;
  return {
    compact,
    labelLeft: compact ? clamp(width * 0.26, 86, 130) : clamp(width * 0.22, 150, 190),
    labelRight: compact ? clamp(width * 0.3, 100, 150) : clamp(width * 0.24, 160, 210),
  };
}

/** One node's label: the name on one or more lines (bold) and the amount (muted) beside it or under it. */
export interface LabelBlock {
  name: string[];
  value: string;
  /** The name and the amount share one line. */
  inline: boolean;
  /** The name or amount was cut short with an ellipsis (the full text is in the chart's description). */
  truncated: boolean;
  lines: number;
  /** Room the label needs vertically, in px. */
  height: number;
  /** Estimated width of the widest line, in px. */
  width: number;
}

export interface SankeyLabelPlan {
  /** Label font size in px. */
  fontSize: number;
  /** Source labels stack the amount under the name instead of putting it beside it. */
  stacked: boolean;
  /** Room reserved left of the source nodes and right of the target nodes, including the gap between node and label. */
  labelLeft: number;
  labelRight: number;
  /** Vertical gaps between nodes, widened when the labels beside them are tall. */
  sourcePadding: number;
  targetPadding: number;
  /** In the order of the model's nodes. */
  sources: LabelBlock[];
  targets: LabelBlock[];
  /** The chart height at which every label, and every node with its gaps, has room. */
  minHeight: number;
}

interface Entry {
  name: string;
  value: string;
}

/** Room a label of `lines` lines needs: its line boxes plus a little air, a little more under a tall label so it does not run into the next one. */
const blockHeight = (lines: number, fontSize: number): number => Math.ceil(lines * fontSize * LABEL_LINE_EM) + (lines > 2 ? 8 : 2);

function stackedBlock(entry: Entry, avail: number, fontSize: number, force: boolean): LabelBlock | null {
  const wrapped = wrapText(entry.name, avail, fontSize, MAX_NAME_LINES, force);
  if (wrapped.overflow && !force) return null;
  let value = entry.value;
  if (estimateTextWidth(value, fontSize) > avail) {
    if (!force) return null;
    value = ellipsize(value, avail, fontSize);
  }
  const lines = wrapped.lines.length + 1;
  const width = Math.max(estimateTextWidth(value, fontSize), ...wrapped.lines.map((l) => estimateTextWidth(l, fontSize)));
  return { name: wrapped.lines, value, inline: false, truncated: wrapped.truncated || value !== entry.value, lines, height: blockHeight(lines, fontSize), width };
}

function inlineBlock(entry: Entry, fontSize: number): LabelBlock {
  const width = estimateTextWidth(entry.name, fontSize) + VALUE_GAP + estimateTextWidth(entry.value, fontSize);
  return { name: [entry.name], value: entry.value, inline: true, truncated: false, lines: 1, height: blockHeight(1, fontSize), width };
}

const columnHeight = (blocks: readonly LabelBlock[]): number =>
  blocks.length === 0 ? 0 : blocks.reduce((sum, b) => sum + b.height, 0) + SANKEY_DEFAULTS.top + SANKEY_DEFAULTS.bottom;
const tallest = (blocks: readonly LabelBlock[]): number => blocks.reduce((m, b) => Math.max(m, b.height), 0);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** One attempt at a type size and layout. `null` when the labels do not fit; with `force` it always answers, cutting text short if it must. */
function attempt(
  sources: Entry[],
  targets: Entry[],
  width: number,
  fontSize: number,
  stacked: boolean,
  tight: boolean,
  force: boolean,
): SankeyLabelPlan | null {
  const widthOf = (t: string): number => estimateTextWidth(t, fontSize);
  const widest = (entries: Entry[], measure: (e: Entry) => number): number => entries.reduce((m, e) => Math.max(m, measure(e)), 0);
  const longestWord = (e: Entry): number => labelWords(e.name).reduce((m, w) => Math.max(m, widthOf(w)), 0);

  // What each side wants (every label on as few lines as it can be) and the least it can live with (names broken at every space).
  const sourceWants = widest(sources, (e) => (stacked ? Math.max(widthOf(e.name), widthOf(e.value)) : widthOf(e.name) + VALUE_GAP + widthOf(e.value)));
  const sourceLeast = stacked ? widest(sources, (e) => Math.max(longestWord(e), widthOf(e.value))) : sourceWants;
  const targetWants = widest(targets, (e) => Math.max(widthOf(e.name), widthOf(e.value)));
  const targetLeast = widest(targets, (e) => Math.max(longestWord(e), widthOf(e.value)));

  const base = baseMargins(width);
  let left = Math.max(base.labelLeft, sourceWants + LABEL_GAP);
  let right = Math.max(base.labelRight, targetWants + LABEL_GAP);
  const leastLeft = Math.min(left, sourceLeast + LABEL_GAP);
  const leastRight = Math.min(right, targetLeast + LABEL_GAP);

  // The labels may take all of the chart but the nodes and the room the ribbons need; past that each side gives up what it can spare.
  const span = tight ? Math.max(SPAN.tightMin, width * SPAN.tightShare) : Math.max(SPAN.min, width * SPAN.share);
  const room = width - 2 * SANKEY_DEFAULTS.nodeWidth - span;
  const excess = left + right - room;
  if (excess > 0) {
    const slack = left - leastLeft + (right - leastRight);
    if (slack >= excess) {
      const cut = (excess * (left - leastLeft)) / slack;
      left -= cut;
      right -= excess - cut;
    } else if (!force) {
      return null;
    } else {
      left = leastLeft;
      right = leastRight;
      const over = left + right - room;
      if (over > 0) {
        const sum = left + right;
        left = Math.max(LEAST_MARGIN, left - (over * left) / sum);
        right = Math.max(LEAST_MARGIN, right - (over * right) / sum);
      }
    }
  }

  const sourceBlocks: LabelBlock[] = [];
  for (const entry of sources) {
    const block = stacked ? stackedBlock(entry, left - LABEL_GAP, fontSize, force) : inlineBlock(entry, fontSize);
    if (!block) return null;
    sourceBlocks.push(block);
  }
  const targetBlocks: LabelBlock[] = [];
  for (const entry of targets) {
    const block = stackedBlock(entry, right - LABEL_GAP, fontSize, force);
    if (!block) return null;
    targetBlocks.push(block);
  }

  // Tall labels get more room between their nodes, so a label stays level with the node it names.
  const sourcePadding = stacked ? clamp(tallest(sourceBlocks) - 12, 30, 56) : 14;
  const targetPadding = clamp(tallest(targetBlocks) - 6, 28, 56);
  const nodesHeight = (count: number, padding: number): number =>
    count === 0 ? 0 : count * SANKEY_DEFAULTS.minNodeHeight + padding * (count - 1) + SANKEY_DEFAULTS.top + SANKEY_DEFAULTS.bottom;
  const minHeight = Math.max(
    columnHeight(sourceBlocks),
    columnHeight(targetBlocks),
    nodesHeight(sources.length, sourcePadding),
    nodesHeight(targets.length, targetPadding),
  );
  return { fontSize, stacked, labelLeft: left, labelRight: right, sourcePadding, targetPadding, sources: sourceBlocks, targets: targetBlocks, minHeight };
}

/**
 * Plans the labels of a Sankey drawn `width` px wide: how much room each side reserves, how every label is broken into lines, and the type size.
 * It keeps the chart's usual look whenever the labels fit it, grows the margins to the words when they need it, and when the chart is too narrow
 * for that wraps the names (at most three lines), then steps the type down, then gives the ribbons less room, and only as a last resort ends a
 * name with an ellipsis.
 */
export function planSankeyLabels(model: SankeyModel, width: number): SankeyLabelPlan {
  const w = Math.max(0, width);
  const values = nodeValues(model);
  const total = values.targets.reduce((sum, v) => sum + v, 0);
  const sources: Entry[] = model.sources.map((n) => ({ name: n.label, value: n.valueLabel }));
  const targets: Entry[] = model.targets.map((n, i) => ({
    name: n.label,
    value: withShare(n.valueLabel, shareText(total > 0 ? values.targets[i]! / total : 0, 1)),
  }));

  const sizes: number[] = [];
  for (let size: number = LABEL_TYPE.size; size >= LABEL_TYPE.min - 1e-9; size -= LABEL_TYPE.step) sizes.push(size);
  const layouts = w < NARROW ? [true] : [false, true];
  for (const size of sizes) {
    for (const stacked of layouts) {
      const plan = attempt(sources, targets, w, size, stacked, false, false);
      if (plan) return plan;
    }
  }
  const smallest = sizes[sizes.length - 1]!;
  return attempt(sources, targets, w, smallest, true, true, false) ?? attempt(sources, targets, w, smallest, true, true, true)!;
}
