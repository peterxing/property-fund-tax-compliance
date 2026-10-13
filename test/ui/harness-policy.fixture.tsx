// Run in a child process by harness.test.tsx. Every "FAILS:" test must be reported as failed and every "PASSES:" test as passed: that is
// the console policy (audit h) and the mount rules the other UI tests lean on. Not a *.test.tsx file, so `npm run test:ui` skips it.
import assert from "node:assert/strict";
import { it } from "node:test";
import { allowConsole, expectConsole, mountApp, render } from "./harness.tsx";

it("FAILS: console.error nobody expected", async () => {
  await render(<p>x</p>);
  console.error("something went wrong");
});

it("FAILS: console.warn nobody expected", async () => {
  await render(<p>x</p>);
  console.warn("something looks off");
});

it("FAILS: React's act() warning (store changed outside act)", async () => {
  const app = await mountApp();
  app.store.setUser("n-pillai");
  await new Promise((resolve) => setTimeout(resolve, 20));
});

it("FAILS: expectConsole that never happened", async () => {
  expectConsole(/never printed/);
  await render(<p>x</p>);
});

it("FAILS: a second mountApp while the first is mounted", async () => {
  await mountApp();
  await mountApp();
});

it("PASSES: expectConsole that happened", async () => {
  expectConsole(/expected failure/);
  await render(<p>x</p>);
  console.error("an expected failure");
});

it("PASSES: allowConsole, with or without output", async () => {
  allowConsole(/tolerated/);
  console.warn("tolerated warning");
});

it("PASSES: leaves the app mounted", async () => {
  await mountApp();
});

it("PASSES: the next test starts on an empty page", () => {
  assert.equal(document.body.children.length, 0);
  assert.equal(localStorage.length, 0);
  assert.equal(window.location.hash, "");
});
