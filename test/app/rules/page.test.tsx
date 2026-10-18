import { test } from "node:test";
import assert from "node:assert/strict";
import { mountApp } from "../../ui/harness.tsx";

test("rules page renders rule list, caveat and detail deep links", async () => {
  const app = await mountApp({ hash: "#/rules", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Rules & sources/);
  assert.match(app.text(), /No tax adviser has reviewed these rules/);
  const links = app.allByRole("link", { name: /.+/ });
  assert.ok(links.some((link) => (link.getAttribute("href") ?? "").startsWith("#/rules?id=")));
  assert.match(app.text(), /Sources/);
  assert.match(app.text(), /Show more/);
});
