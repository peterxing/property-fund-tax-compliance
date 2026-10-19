import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mountApp } from "../../ui/harness.tsx";
import { flatText } from "../../ui/dom.ts";

const GST = "#/gst?fund=telok-ayer&period=2026-09-30";
const blocked = (el: HTMLElement): boolean => el.getAttribute("aria-disabled") === "true";

describe("the GST & BAS workspace", () => {
  it("shows F5 boxes, checks, ledger and IAF export for a Head of Tax user", async () => {
    const app = await mountApp({ hash: GST, user: "a-moreno" });
    assert.match(app.text(), /GST F5 Jul.Sep 2026|GST F5 Jul–Sep 2026/);
    assert.match(app.text(), /Box 1 · Standard-rated supplies/);
    assert.match(app.text(), /SG_F5\.8/);
    assert.match(app.text(), /Partial exemption review/);
    assert.match(app.text(), /IRAS GST F5 is due one month after the quarter end/);
    assert.equal(app.queryByRole("button", "Download IRAS Audit File (IAF)") !== null, true);
    assert.match(app.text(), /follows published descriptions of the IRAS Audit File, not the IRAS field specification itself/);
    assert.equal(blocked(app.byRole("button", "Add entry")), false);
    assert.match(app.text(), /Standard-rated local supplies/);
    assert.doesNotMatch(app.text(), /gst-telok-ayer-/);

    await app.click(app.allByRole("button", { name: /Show \d+ ledger line/ })[0]);
    assert.equal(app.byRole("button", /Hide ledger lines/).getAttribute("aria-expanded"), "true");
    assert.match(app.text(), /Commercial rent and recoveries/);
    assert.match(app.text(), /S\$14,722,819\.57/);
  });

  it("shows BAS labels and locks a lodged period until unlocked", async () => {
    const app = await mountApp({ hash: "#/gst?fund=harbourline&period=2025-09-30", user: "a-moreno" });
    assert.match(app.text(), /BAS Jul.Sep 2025|BAS Jul–Sep 2025/);
    assert.match(app.text(), /AU_BAS\.1A/);
    assert.equal(blocked(app.byRole("button", "Add entry")), true);
    assert.match(flatText(app.byRole("region", "GST & BAS period")), /Lodged period/);
    assert.match(app.text(), /rounded down to whole dollars/);
    assert.match(app.text(), /lodgment program concession/);
    assert.match(app.text(), /A\$2,717,909/);
    assert.equal(app.queryByRole("button", "Download BAS worksheet (CSV)") !== null, true);
    assert.equal(app.queryByRole("button", "Edit"), null);
  });

  it("filters the ledger to the selected period by default and can show all periods", async () => {
    const app = await mountApp({ hash: GST, user: "a-moreno" });
    assert.match(app.text(), /TELO-GST-401/);
    assert.doesNotMatch(app.text(), /TELO-GST-101/);
    await app.select(app.byLabel("Ledger period scope"), "All periods");
    assert.match(app.text(), /TELO-GST-101/);
  });

  it("lets the Singapore preparer edit an open period", async () => {
    const app = await mountApp({ hash: GST, user: "w-l-teo" });
    assert.equal(blocked(app.byRole("button", "Add entry")), false);
    assert.equal(blocked(app.byRole("button", "Import CSV or Excel")), false);
  });

  it("renders as read-only for the view-only persona", async () => {
    const app = await mountApp({ hash: "#/gst?fund=coastline&period=2026-09-30", user: "m-castillo" });
    assert.equal(blocked(app.byRole("button", "Add entry")), true);
    assert.equal(blocked(app.byRole("button", "Import CSV or Excel")), true);
    assert.match(app.text(), /View only for your role/);
    assert.equal(app.queryByRole("button", "Edit"), null);
    assert.equal(app.queryByRole("button", "Record lodgment"), null, "no lodgment form for someone who cannot record lodgment");
    assert.equal(app.queryByRole("textbox", "Reference"), null);
    assert.match(flatText(app.byRole("region", "Lodgment")), /Recorded by the head of tax under this fund's governance \(no tax agent\)\./);
  });

  it("gives the lodgment form to whoever records lodgment under the fund's governance, and the unlock form only to the Head of Tax", async () => {
    const agent = await mountApp({ hash: "#/gst?fund=southbank", user: "d-harrow" });
    assert.equal(agent.queryByRole("button", "Record lodgment") !== null, true, "the tax agent lodges for Southbank");
    await agent.unmount();

    const head = await mountApp({ hash: "#/gst?fund=southbank", user: "a-moreno" });
    assert.equal(head.queryByRole("button", "Record lodgment"), null, "not the Head of Tax where the agent lodges");
    assert.match(flatText(head.byRole("region", "Lodgment")), /Recorded by the tax agent under this fund's governance \(tax agent reviews and lodges\)\./);
    await head.unmount();

    const lodged = await mountApp({ hash: "#/gst?fund=harbourline&period=2025-09-30", user: "r-okafor" });
    assert.equal(lodged.queryByRole("button", "Unlock lodged period"), null, "a preparer cannot unlock a lodged period");
    assert.match(flatText(lodged.byRole("region", "Lodgment")), /Only the Head of Tax can unlock a lodged period\./);
    await lodged.unmount();

    const unlocker = await mountApp({ hash: "#/gst?fund=harbourline&period=2025-09-30", user: "a-moreno" });
    assert.equal(unlocker.queryByRole("button", "Unlock lodged period") !== null, true);
  });
});
