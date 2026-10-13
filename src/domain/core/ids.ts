// Sequential ids for records appended by reducers: "a-21", "q-5". Existing ids may carry a suffix ("a-02b"): only the leading number counts,
// and only when it is short enough to add one to exactly (a stored id such as "a-99999999999999999999" must not stall the search below).
const MAX_DIGITS = 9;

export function nextSequenceId(prefix: string, existing: readonly string[]): string {
  const lead = `${prefix}-`;
  let max = 0;
  for (const id of existing) {
    if (!id.startsWith(lead)) continue;
    const digits = /^\d+/.exec(id.slice(lead.length));
    if (digits && digits[0].length <= MAX_DIGITS) max = Math.max(max, Number(digits[0]));
  }
  const taken = new Set(existing);
  let n = max + 1;
  while (taken.has(`${lead}${n}`)) n += 1;
  return `${lead}${n}`;
}