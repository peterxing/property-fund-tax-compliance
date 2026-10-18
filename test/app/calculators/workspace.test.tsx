import { test } from "node:test";
import assert from "node:assert/strict";
import { mountApp } from "../../ui/harness.tsx";

test("calculator workspace deep links to Australian transfer duty and computes", async () => {
  const app = await mountApp({ hash: "#/calculators?calc=au-transfer-duty", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Tax calculators/);
  assert.match(app.text(), /Transfer duty and landholder duty/);
  assert.match(app.text(), /Total transfer duty/);
  assert.match(app.text(), /au-transfer-duty/);
});

test("calculator workspace deep links to Singapore property tax and computes", async () => {
  const app = await mountApp({ hash: "#/calculators?calc=sg-property-tax", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Property tax/);
  assert.match(app.text(), /Net property tax/);
  assert.match(app.text(), /property-tax\.other\.10pct/);
});

test("calculator workspace deep links to GST and shows validation output", async () => {
  const app = await mountApp({ hash: "#/calculators?calc=sg-gst", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /GST registration and late penalties/);
  assert.match(app.text(), /GST registration required/);
  assert.match(app.text(), /Late filing penalty/);
});
