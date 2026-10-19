import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildXlsx } from "../../../src/app/exports/xlsx.ts";
import { tbView } from "../../../src/domain/index.ts";
import { flatText } from "../../ui/dom.ts";
import { clock, mountApp } from "../../ui/harness.tsx";
import { expectNone } from "../../ui/same.ts";

const COASTLINE = "#/trial-balance?fund=coastline";
const IMPORT = "Import trial balance";

const now = () => new Date(clock.now.getTime());
const dialog = (app: Awaited<ReturnType<typeof mountApp>>) => app.byRole("dialog", IMPORT);
const replaceButton = (app: Awaited<ReturnType<typeof mountApp>>) => app.byRole("button", "Replace trial balance");
const viewOf = (app: Awaited<ReturnType<typeof mountApp>>) => tbView(app.store.getState().data, "coastline", now());

describe("trial balance Excel import", () => {
  it("loads an .xlsx workbook through the import dialog and imports the first sheet", async () => {
    const app = await mountApp({ hash: COASTLINE, user: "r-okafor" });
    await app.click(app.byRole("button", IMPORT));

    const bytes = buildXlsx({
      fileName: "tb.xlsx",
      sheets: [{
        name: "Trial upload",
        columns: ["Account", "Name", "Current", "Prior", "Tax category"],
        rows: [["1000", "Cash at bank", 250, 100, "Balance sheet"], ["4000", "Rent received", -250, -100, "Rental and property income"]],
      }],
    });
    const file = new File([bytes], "tb.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const input = app.$('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await app.act(() => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await app.flush();

    assert.match(flatText(dialog(app)), /Read the first sheet: Trial upload\./);
    assert.match(flatText(dialog(app)), /2 accounts ready to import\./);
    assert.equal(replaceButton(app).getAttribute("aria-disabled"), null);

    await app.click(replaceButton(app));
    expectNone(app.queryByRole("dialog"), "it should not be on the page");
    assert.deepEqual(viewOf(app).rows.map((row) => [row.account, row.name, row.category, row.current, row.prior]), [
      ["1000", "Cash at bank", "balance-sheet", 25000, 10000],
      ["4000", "Rent received", "rent", -25000, -10000],
    ]);
  });
});
