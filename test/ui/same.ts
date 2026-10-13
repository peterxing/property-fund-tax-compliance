// Comparing DOM nodes in assertions. `assert.equal(node, other)` and `assert.deepEqual` on a value that holds a node are unusable once they fail:
// Node prints both sides with an unlimited depth, and a node that React rendered carries its fibre (the whole app tree) in an own property, so the
// message takes minutes to build and runs to megabytes. These helpers compare with === and describe a node in a few words instead.
import assert from "node:assert/strict";
import { describe as describeElement, pathOf } from "./dom.ts";

/** A node for a failure message: `button.fund-action "Sign off" in main#main > header.fund-header > div.fund-actions`. */
export function showNode(node: Node | null | undefined): string {
  if (node === null || node === undefined) return String(node);
  if (node.nodeType !== 1) return `a ${node.nodeName} node`;
  const element = node as Element;
  return `${describeElement(element)} in ${pathOf(element)}`;
}

/** `actual` is the very node `expected`, or both are null. */
export function expectSame(actual: Node | null | undefined, expected: Node | null | undefined, message: string): void {
  assert.ok(actual === expected, `${message}: expected ${showNode(expected)}, found ${showNode(actual)}`);
}

/** `actual` is not the node `rejected`. */
export function expectNotSame(actual: Node | null | undefined, rejected: Node, message: string): void {
  assert.ok(actual !== rejected, `${message}: found ${showNode(rejected)}`);
}

/** A query found no node. */
export function expectNone(actual: Node | null | undefined, message: string): void {
  assert.ok(actual === null || actual === undefined, `${message}: found ${showNode(actual)}`);
}

/** `data` with the element it describes attached as a property that deepEqual and inspect skip, so a failed comparison prints the data and not the element. */
export function withElement<T extends object, E extends Element>(data: T, element: E): T & { readonly element: E } {
  return Object.defineProperty(data, "element", { value: element, enumerable: false }) as T & { readonly element: E };
}
