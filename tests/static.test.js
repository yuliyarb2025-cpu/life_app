import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlUrl = new URL("../index.html", import.meta.url);
const gameUrl = new URL("../src/game.js", import.meta.url);
const patternsUrl = new URL("../src/patterns.js", import.meta.url);
const uiUrl = new URL("../src/ui.js", import.meta.url);

const REQUIRED_IDS = [
  "btn-start",
  "btn-stop",
  "btn-forward",
  "btn-back",
  "btn-generate",
  "board",
  "gen-counter",
  "population",
  "run-state",
];

test("index.html contains all required element ids", async () => {
  const html = await readFile(htmlUrl, "utf8");
  for (const id of REQUIRED_IDS) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test("control buttons appear in the specified order", async () => {
  const html = await readFile(htmlUrl, "utf8");
  const order = ["btn-start", "btn-stop", "btn-forward", "btn-back", "btn-generate"];
  const positions = order.map((id) => {
    const i = html.indexOf(`id="${id}"`);
    assert.notEqual(i, -1, `missing #${id}`);
    return i;
  });
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i] > positions[i - 1], `#${order[i]} must come after #${order[i - 1]}`);
  }
});

test("index.html canvas is declared as 800x400 and module script is wired", async () => {
  const html = await readFile(htmlUrl, "utf8");
  assert.match(html, /<canvas[^>]*id="board"[^>]*width="800"[^>]*height="400"/);
  assert.match(html, /<script[^>]*type="module"[^>]*src="src\/ui\.js"/);
});

test("src/game.js is DOM-free (no document/window/canvas)", async () => {
  const src = await readFile(gameUrl, "utf8");
  for (const token of ["document", "window", "canvas", "getElementById", "requestAnimationFrame"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${token}\\b`), `game.js must not reference ${token}`);
  }
});

test("src/patterns.js is DOM-free (no document/window/canvas)", async () => {
  const src = await readFile(patternsUrl, "utf8");
  for (const token of ["document", "window", "canvas", "getElementById", "requestAnimationFrame"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${token}\\b`), `patterns.js must not reference ${token}`);
  }
});

test("index.html wires the clear button and the pattern palette", async () => {
  const html = await readFile(htmlUrl, "utf8");
  const generateIndex = html.indexOf('id="btn-generate"');
  const clearIndex = html.indexOf('id="btn-clear"');
  assert.notEqual(clearIndex, -1, "missing #btn-clear");
  assert.ok(clearIndex > generateIndex, "#btn-clear must come after #btn-generate");
  assert.match(html, /id="palette"/);
  assert.match(html, /class="pattern-list"/);
});

test("src/ui.js uses the specified rendering constants", async () => {
  const src = await readFile(uiUrl, "utf8");
  assert.match(src, /export const CELL_SIZE = 4;/);
  assert.match(src, /#3ddc84/);
  assert.match(src, /#101418/);
});
