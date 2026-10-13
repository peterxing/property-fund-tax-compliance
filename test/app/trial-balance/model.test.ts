import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, tbView, workflowView } from "../../../src/domain/index.ts";
import type { AppData, TbRowView } from "../../../src/domain/types.ts";
import {
  ALREADY_MATCHES,
  BALANCE_TOLERANCE,
  DEFAULT_THRESHOLD,
  MAP_EVERY_ACCOUNT,
  SORT_OPTIONS,
  UNMAPPED_LABEL,
  allAccountsMapped,
  bookToTaxLines,
  categoryOptions,
  changeFlag,
  changePctText,
  componentLines,
  distributionSync,
  flagLabel,
  isBalanced,
  moneyExact,
  planImport,
  selectedCategory,
  sentence,
  sortRows,
  statusChips,
  tbExportCsv,
  tbTotals,
  unmappedCount,
} from "../../../src/app/workspaces/trial-balance/model.ts";
import { ALL_IDS, AU_IDS, NOW, SG_IDS, ctxFor, freshData, fundOf } from "./fixtures.ts";

const view = (data: AppData, id: string) => tbView(data, id, NOW);

/** Moves the first row of the fund by `cents`, which moves the total of the ledger by the same amount. */
function skew(data: AppData, id: string, cents: number): AppData {
  const row = data.tbRows.find((r) => r.fundId === id);
  assert.ok(row);
  row.current += cents;
  return data;
}

describe("money text", () => {
  it("shows whole dollars without cents and anything else to the cent, with the typographic minus", () => {
    assert.equal(moneyExact(1941366000, "AUD"), "A$19,413,660");
    assert.equal(moneyExact(0, "SGD"), "S$0");
    assert.equal(moneyExact(-120050, "AUD"), "\u2212A$1,200.50");
    assert.equal(moneyExact(-5, "SGD"), "\u2212S$0.05");
    assert.equal(moneyExact(-300000, "SGD"), "\u2212S$3,000");
  });

  it("turns a lock reason into a sentence once", () => {
    assert.equal(sentence("Signed off \u2014 reopen to edit"), "Signed off \u2014 reopen to edit.");
    assert.equal(sentence("Already a sentence."), "Already a sentence.");
    assert.equal(sentence("  View only for your role  "), "View only for your role.");
    assert.equal(sentence(""), "");
  });
});

describe("balance tolerance", () => {
  it("matches the domain: AU to the cent, SG to within 50 cents", () => {
    assert.deepEqual(BALANCE_TOLERANCE, { AU: 0, SG: 50 });
    for (const [market, id, offsets] of [
      ["AU", "harbourline", [0, 1, -1, 100]],
      ["SG", "kallang", [0, 1, 49, -49, 50, -50, 51, 100]],
    ] as const) {
      for (const offset of offsets) {
        const v = view(skew(freshData(), id, offset), id);
        assert.equal(isBalanced(v.totalDebitsLessCredits, market), v.balanced, `${id} ${offset}`);
      }
    }
  });
});

describe("status chips", () => {
  it("shows three good chips for a balanced, fully mapped fund that matches its distribution", () => {
    for (const [id, currency] of [["harbourline", "AUD"], ["kallang", "SGD"]] as const) {
      const chips = statusChips(view(freshData(), id), currency);
      assert.deepEqual(
        chips.map((c) => [c.key, c.ok, c.tone, c.text]),
        [
          ["balanced", true, "good", "Balanced"],
          ["mapped", true, "good", "All accounts mapped"],
          ["distribution", true, "good", "Matches the distribution"],
        ],
        id,
      );
    }
  });

  it("counts the accounts that need a tax category", () => {
    const data = freshData();
    const coastline = view(data, "coastline");
    assert.equal(unmappedCount(coastline), 1);
    assert.equal(statusChips(coastline, "AUD")[1]?.text, "1 account needs a tax category");
    assert.equal(statusChips(coastline, "AUD")[1]?.tone, "warn");
    for (const row of data.tbRows.filter((r) => r.fundId === "coastline").slice(0, 2)) row.category = "unmapped";
    const three = view(data, "coastline");
    assert.equal(unmappedCount(three), 3);
    assert.equal(statusChips(three, "AUD")[1]?.text, "3 accounts need a tax category");
  });

  it("counts a category the market does not list as needing one", () => {
    for (const [id, currency] of [["harbourline", "AUD"], ["kallang", "SGD"]] as const) {
      const data = freshData();
      const row = data.tbRows.find((r) => r.fundId === id);
      assert.ok(row);
      row.category = "not-a-category";
      const v = view(data, id);
      assert.equal(unmappedCount(v), 1, id);
      assert.equal(allAccountsMapped(v), false, id);
      assert.equal(statusChips(v, currency)[1]?.text, "1 account needs a tax category", id);
      assert.equal(statusChips(v, currency)[1]?.ok, false, id);
    }
  });

  it("says by how much the ledger is out of balance, to the cent", () => {
    const au = statusChips(view(skew(freshData(), "harbourline", 1), "harbourline"), "AUD")[0];
    assert.deepEqual([au?.ok, au?.tone, au?.text], [false, "bad", "Out of balance by A$0.01"]);
    const negative = statusChips(view(skew(freshData(), "harbourline", -123456), "harbourline"), "AUD")[0];
    assert.equal(negative?.text, "Out of balance by A$1,234.56");
    const within = statusChips(view(skew(freshData(), "kallang", 49), "kallang"), "SGD")[0];
    assert.equal(within?.text, "Balanced");
    const out = statusChips(view(skew(freshData(), "kallang", 50), "kallang"), "SGD")[0];
    assert.equal(out?.text, "Out of balance by S$0.50");
  });

  it("says when the trial balance differs from the distribution", () => {
    const data = freshData();
    const row = data.tbRows.find((r) => r.fundId === "harbourline" && r.category === "rent");
    assert.ok(row);
    row.category = "balance-sheet";
    const v = view(data, "harbourline");
    assert.equal(v.matchesDistribution, false);
    assert.deepEqual(
      [statusChips(v, "AUD")[2]?.ok, statusChips(v, "AUD")[2]?.tone, statusChips(v, "AUD")[2]?.text],
      [false, "warn", "Differs from the distribution"],
    );
  });

  it("agrees with the domain for every fund", () => {
    for (const id of ALL_IDS) {
      const v = view(freshData(), id);
      const chips = statusChips(v, fundOf(freshData(), id).market === "AU" ? "AUD" : "SGD");
      assert.equal(chips[0]?.ok, v.balanced, id);
      assert.equal(chips[1]?.ok, v.allMapped, id);
      assert.equal(chips[2]?.ok, v.matchesDistribution, id);
    }
  });
});

describe("CSV export", () => {
  it("has the file name, the columns and one row per account, in major units", () => {
    const data = freshData();
    const model = tbExportCsv(fundOf(data, "harbourline").name, view(data, "harbourline"));
    assert.equal(model.fileName, "harbourline-office-trust-trial-balance.csv");
    assert.deepEqual(model.columns, ["Account", "Name", "Tax category", "Treatment", "Current", "Prior", "Change"]);
    assert.equal(model.rows.length, view(data, "harbourline").rows.length);
    assert.deepEqual(model.rows[0], ["1000", "Cash at bank", "Balance sheet", "Not part of taxable income", 19413660, 21743299, -2329639]);
    assert.equal(
      model.rows.reduce((sum, row) => sum + Math.round((row[4] as number) * 100), 0),
      0,
    );
  });

  it("writes cents as decimals, credits as negative numbers and never negative zero", () => {
    const data = freshData();
    const rows = data.tbRows.filter((r) => r.fundId === "coastline");
    assert.ok(rows[0] && rows[1]);
    rows[0].current = 12345;
    rows[0].prior = -5;
    rows[1].current = 0;
    rows[1].prior = 0;
    const model = tbExportCsv("Coastline", view(data, "coastline"));
    assert.deepEqual([model.rows[0]?.[4], model.rows[0]?.[5], model.rows[0]?.[6]], [123.45, -0.05, 123.5]);
    for (const cell of model.rows[1]?.slice(4) ?? []) assert.ok(Object.is(cell, 0), String(cell));
  });

  it("names the unmapped category for an account that has none", () => {
    const data = freshData();
    const model = tbExportCsv("Coastline Healthcare Property Fund", view(data, "coastline"));
    const row = model.rows.find((r) => r[0] === "4510");
    assert.deepEqual(row?.slice(0, 4), ["4510", "Make-good income received", UNMAPPED_LABEL, "Excluded until mapped"]);
    assert.equal(model.fileName, "coastline-healthcare-property-fund-trial-balance.csv");
  });
});

describe("tax category choices", () => {
  it("lists the market's categories in order with 'Needs a tax category' last, once", () => {
    const data = freshData();
    const au = categoryOptions(data.tbCategories.AU);
    assert.equal(au.length, 15);
    assert.equal(au.filter((o) => o.value === "unmapped").length, 1);
    assert.deepEqual(au.at(-1), { value: "unmapped", label: UNMAPPED_LABEL });
    assert.deepEqual(au[0], { value: "rent", label: "Rental and property income" });
    const sg = categoryOptions(data.tbCategories.SG);
    assert.equal(sg.length, data.tbCategories.SG.length + 1);
    assert.deepEqual(sg.at(-1), { value: "unmapped", label: UNMAPPED_LABEL });
    assert.deepEqual(sg.slice(0, -1).map((o) => o.value), data.tbCategories.SG.map((c) => c.id));
  });

  it("selects the unmapped option for an id that is not in the list", () => {
    const options = categoryOptions(freshData().tbCategories.SG);
    assert.equal(selectedCategory("rent", options), "rent");
    assert.equal(selectedCategory("unmapped", options), "unmapped");
    assert.equal(selectedCategory("fair-value-au", options), "unmapped");
    assert.equal(selectedCategory("", options), "unmapped");
  });

  it("offers every category that the mapping action accepts and nothing else", () => {
    const data = freshData();
    const options = categoryOptions(data.tbCategories.SG);
    const ctx = ctxFor(data, "a-moreno");
    const row = data.tbRows.find((r) => r.fundId === "kallang");
    assert.ok(row);
    for (const option of options) {
      const result = applyAction(data, { type: "update-tb-category", fundId: "kallang", rowId: row.id, category: option.value }, ctx);
      assert.ok(result.ok, `${option.value}: ${result.ok ? "" : result.reason}`);
    }
  });
});

describe("change highlighting", () => {
  const row = (change: number, changePct: number | null): Pick<TbRowView, "change" | "changePct"> => ({ change, changePct });

  it("flags a change over the threshold, up or down, but not one at the threshold", () => {
    assert.equal(DEFAULT_THRESHOLD, 20);
    assert.equal(changeFlag(row(100, 25), 20), "over");
    assert.equal(changeFlag(row(-100, -25), 20), "over");
    assert.equal(changeFlag(row(100, 20), 20), null);
    assert.equal(changeFlag(row(100, 19.99), 20), null);
    assert.equal(changeFlag(row(100, 0.5), 0), "over");
    assert.equal(changeFlag(row(100, 5000), 10_000), null);
  });

  it("never flags an account that did not change", () => {
    assert.equal(changeFlag(row(0, 0), 0), null);
    assert.equal(changeFlag(row(0, null), 20), null);
  });

  it("flags a balance that appears where there was none as new", () => {
    assert.equal(changeFlag(row(-18643000, null), 20), "new");
    assert.equal(changeFlag(row(5, Number.POSITIVE_INFINITY), 20), "new");
    assert.equal(changeFlag(row(5, Number.NaN), 20), "new");
  });

  it("writes the flag as words", () => {
    assert.equal(flagLabel("over", 20), "Over 20%");
    assert.equal(flagLabel("over", 12.5), "Over 12.5%");
    assert.equal(flagLabel("over", 33.333), "Over 33.33%");
    assert.equal(flagLabel("new", 20), "New balance");
    assert.equal(flagLabel(null, 20), null);
  });

  it("writes the change % to one decimal, with an en dash when there is no prior balance", () => {
    assert.equal(changePctText(null), "\u2013");
    assert.equal(changePctText(Number.NaN), "\u2013");
    assert.equal(changePctText(Number.POSITIVE_INFINITY), "\u2013");
    assert.equal(changePctText(0), "0.0%");
    assert.equal(changePctText(-0.04), "0.0%");
    assert.equal(changePctText(0.05), "0.1%");
    assert.equal(changePctText(258.7), "258.7%");
    assert.equal(changePctText(-10.714292928578788), "-10.7%");
    assert.equal(changePctText(1234.56), "1,234.6%");
    assert.equal(changePctText(-1_000_000), "-1,000,000.0%");
  });

  it("flags only Coastline's new account at the default threshold among its rows that moved little", () => {
    const rows = view(freshData(), "coastline").rows;
    const flagged = rows.filter((r) => changeFlag(r, DEFAULT_THRESHOLD) !== null);
    assert.ok(flagged.some((r) => r.account === "4510" && changeFlag(r, DEFAULT_THRESHOLD) === "new"));
    for (const r of flagged) assert.ok(r.changePct === null || Math.abs(r.changePct) > DEFAULT_THRESHOLD, r.account);
  });
});

describe("sorting", () => {
  it("offers Account and Largest change", () => {
    assert.deepEqual(SORT_OPTIONS.map((o) => [o.value, o.label]), [["account", "Account"], ["change", "Largest change"]]);
  });

  it("keeps the domain's order by account, on a copy", () => {
    const rows = view(freshData(), "coastline").rows;
    const sorted = sortRows(rows, "account");
    assert.deepEqual(sorted, rows);
    assert.notEqual(sorted, rows);
  });

  it("puts the biggest movement first, up or down, and keeps the order among equal movements", () => {
    const rows = [
      { id: "a", change: 5 },
      { id: "b", change: -50 },
      { id: "c", change: 50 },
      { id: "d", change: 0 },
      { id: "e", change: -5 },
    ];
    assert.deepEqual(sortRows(rows, "change").map((r) => r.id), ["b", "c", "a", "e", "d"]);
    assert.deepEqual(rows.map((r) => r.id), ["a", "b", "c", "d", "e"]);
  });

  it("orders a real trial balance by the size of the change", () => {
    const rows = view(freshData(), "harbourline").rows;
    const sorted = sortRows(rows, "change");
    assert.equal(sorted.length, rows.length);
    for (let i = 1; i < sorted.length; i++) assert.ok(Math.abs(sorted[i - 1]?.change ?? 0) >= Math.abs(sorted[i]?.change ?? 0));
    assert.deepEqual([...sorted].sort((a, b) => a.account.localeCompare(b.account)), [...rows].sort((a, b) => a.account.localeCompare(b.account)));
  });
});

describe("totals", () => {
  it("adds the current and prior columns", () => {
    assert.deepEqual(tbTotals([{ current: 100, prior: -40 }, { current: -30, prior: 10 }]), { current: 70, prior: -30 });
    assert.deepEqual(tbTotals([]), { current: 0, prior: 0 });
  });

  it("agrees with the domain's balance check for every fund", () => {
    for (const id of ALL_IDS) {
      const v = view(freshData(), id);
      assert.equal(tbTotals(v.rows).current, v.totalDebitsLessCredits, id);
    }
  });
});

describe("book to tax", () => {
  it("has one result line, last, for the AU and SG layouts", () => {
    for (const id of ALL_IDS) {
      const v = view(freshData(), id);
      const lines = bookToTaxLines(v.bookToTax);
      assert.equal(lines.filter((l) => l.kind === "result").length, 1, id);
      assert.deepEqual([lines.at(-1)?.label, lines.at(-1)?.amount], [v.bookToTax.resultLabel, v.bookToTax.result], id);
      assert.equal(lines[0]?.kind, "start", id);
    }
  });

  it("adds the result line when the market leaves it out", () => {
    const v = view(freshData(), "kallang");
    assert.equal(v.bookToTax.rows.some((r) => r.kind === "result"), false);
    assert.equal(bookToTaxLines(v.bookToTax).length, v.bookToTax.rows.length + 1);
  });

  it("does not repeat the result line when the market includes it", () => {
    const v = view(freshData(), "harbourline");
    assert.equal(v.bookToTax.rows.some((r) => r.kind === "result"), true);
    assert.equal(bookToTaxLines(v.bookToTax).length, v.bookToTax.rows.length);
  });
});

describe("distribution components and Update distribution", () => {
  const agree = [{ agrees: true }, { agrees: true }];
  const differ = [{ agrees: true }, { agrees: false }];

  it("works out the difference as distribution less trial balance", () => {
    const lines = componentLines([
      { key: "a", label: "A", trialBalance: 1000, distribution: 900, agrees: false },
      { key: "b", label: "B", trialBalance: 500, distribution: 500, agrees: true },
    ]);
    assert.deepEqual(lines.map((l) => l.difference), [-100, 0]);
    assert.equal(lines[0]?.label, "A");
  });

  it("is switched off, with the reason, while the fund is locked or the viewer cannot edit", () => {
    assert.deepEqual(distributionSync({ canEdit: false, lockedReason: "Signed off \u2014 reopen to edit", allMapped: true, components: differ }), {
      enabled: false,
      hint: "Signed off \u2014 reopen to edit.",
    });
    assert.equal(distributionSync({ canEdit: false, lockedReason: "", allMapped: true, components: differ }).hint, "View only for your role.");
    assert.equal(distributionSync({ canEdit: false, lockedReason: "View only for your role", allMapped: false, components: agree }).hint, "View only for your role.");
  });

  it("asks for every account to be mapped before anything else", () => {
    assert.deepEqual(distributionSync({ canEdit: true, lockedReason: "", allMapped: false, components: differ }), { enabled: false, hint: MAP_EVERY_ACCOUNT });
    assert.equal(distributionSync({ canEdit: true, lockedReason: "", allMapped: false, components: agree }).hint, MAP_EVERY_ACCOUNT);
  });

  it("says when there is nothing to update, and is available when something differs", () => {
    assert.deepEqual(distributionSync({ canEdit: true, lockedReason: "", allMapped: true, components: agree }), { enabled: false, hint: ALREADY_MATCHES });
    assert.deepEqual(distributionSync({ canEdit: true, lockedReason: "", allMapped: true, components: differ }), { enabled: true, hint: null });
  });

  it("follows Coastline from unmapped, to mapped but different, to updated", () => {
    const ctx = ctxFor(freshData(), "a-moreno");
    const data = freshData();
    const sync = (v: ReturnType<typeof view>) =>
      distributionSync({ canEdit: workflowView(data, "coastline", ctx).can.edit, lockedReason: "", allMapped: allAccountsMapped(v), components: v.components });

    assert.equal(sync(view(data, "coastline")).hint, MAP_EVERY_ACCOUNT);

    const mapped = applyAction(data, { type: "update-tb-category", fundId: "coastline", rowId: "tb-coastline-4510", category: "rent" }, ctx);
    assert.ok(mapped.ok);
    if (!mapped.ok) return;
    const mappedView = view(mapped.data, "coastline");
    assert.deepEqual(sync(mappedView), { enabled: true, hint: null });
    const lines = componentLines(mappedView.components);
    assert.deepEqual(lines.filter((l) => !l.agrees).map((l) => [l.key, l.difference]), [["ausOtherIncome", 1697045000 - 1715688000]]);

    const synced = applyAction(mapped.data, { type: "sync-distribution-from-tb", fundId: "coastline" }, ctx);
    assert.ok(synced.ok);
    if (!synced.ok) return;
    const after = view(synced.data, "coastline");
    assert.equal(after.matchesDistribution, true);
    assert.deepEqual(distributionSync({ canEdit: true, lockedReason: "", allMapped: after.allMapped, components: after.components }), {
      enabled: false,
      hint: ALREADY_MATCHES,
    });
  });
});

describe("import plan", () => {
  const categories = freshData().tbCategories.AU;
  const existing = [
    { account: "4000", category: "rent" },
    { account: "5000", category: "deductible-expense" },
    { account: "6000", category: "unmapped" },
    { account: "7000", category: "not-a-category" },
    { account: "9000", category: "fair-value" },
  ];

  it("keeps the category an account has now when the file gives none, and lets the file win when it does", () => {
    const plan = planImport(
      [
        { account: "4000", name: "Rent", current: -100, prior: -90 },
        { account: "5000", name: "Fees", category: "fair-value", current: 60, prior: 50 },
        { account: "6000", name: "Was unmapped", current: 20, prior: 20 },
        { account: "7000", name: "Explicit reset", category: "unmapped", current: 10, prior: 10 },
        { account: "8000", name: "New", current: 10, prior: 10 },
      ],
      existing,
      categories,
      "AU",
    );
    assert.deepEqual(plan.rows, [
      { account: "4000", name: "Rent", category: "rent", current: -100, prior: -90 },
      { account: "5000", name: "Fees", category: "fair-value", current: 60, prior: 50 },
      { account: "6000", name: "Was unmapped", current: 20, prior: 20 },
      { account: "7000", name: "Explicit reset", current: 10, prior: 10 },
      { account: "8000", name: "New", current: 10, prior: 10 },
    ]);
    assert.deepEqual([plan.count, plan.kept, plan.unmapped], [5, 1, 3]);
    assert.deepEqual([plan.replaces, plan.dropped, plan.added], [5, 1, 1]);
  });

  it("totals the file and says whether it balances, by market", () => {
    const rows = (current: number) => [
      { account: "1", name: "A", current, prior: 0 },
      { account: "2", name: "B", current: -100, prior: 0 },
    ];
    const au = (total: number) => planImport(rows(100 + total), [], categories, "AU");
    assert.deepEqual([au(0).totalCurrent, au(0).balanced], [0, true]);
    assert.equal(au(1).balanced, false);
    assert.equal(au(-1).balanced, false);
    const sg = (total: number) => planImport(rows(100 + total), [], freshData().tbCategories.SG, "SG");
    assert.equal(sg(49).balanced, true);
    assert.equal(sg(-49).balanced, true);
    assert.equal(sg(50).balanced, false);
    assert.equal(sg(-50).balanced, false);
    assert.equal(planImport([{ account: "1", name: "A", current: 5, prior: -7 }], [], categories, "AU").totalPrior, -7);
  });

  it("drops a category the market does not have", () => {
    const plan = planImport([{ account: "1", name: "A", category: "cross-staple", current: 0, prior: 0 }], [], categories, "AU");
    assert.equal("category" in (plan.rows[0] ?? {}), false);
    assert.equal(plan.unmapped, 1);
  });

  it("does not change what it was given", () => {
    const rows = [{ account: "4000", name: "Rent", current: -100, prior: -90 }];
    const snapshot = JSON.stringify([rows, existing]);
    planImport(rows, existing, categories, "AU");
    assert.equal(JSON.stringify([rows, existing]), snapshot);
  });

  it("counts every account as added when the fund has no trial balance yet", () => {
    const plan = planImport([{ account: "1", name: "A", current: 0, prior: 0 }], [], categories, "AU");
    assert.deepEqual([plan.replaces, plan.dropped, plan.added, plan.kept], [0, 0, 1, 0]);
  });
});

describe("the funds", () => {
  it("cover both markets", () => {
    assert.equal(AU_IDS.length + SG_IDS.length, 9);
  });
});
