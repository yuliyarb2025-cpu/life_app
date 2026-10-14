import test from "node:test";
import assert from "node:assert/strict";

import {
  createGrid,
  gridIndex,
  countNeighbors,
  nextGeneration,
  randomGrid,
  countAlive,
  createHistory,
  historyForward,
  historyBack,
  historyReset,
  canStepBack,
  HISTORY_CAP,
  WIDTH,
  HEIGHT,
} from "../src/game.js";

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Independent reference implementation of the 8-neighbour toroidal B3/S23 rule.
function referenceNeighbors(grid, w, h, x, y) {
  let c = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = (((x + dx) % w) + w) % w;
      const ny = (((y + dy) % h) + h) % h;
      if (grid[ny * w + nx]) c += 1;
    }
  }
  return c;
}

function referenceNext(grid, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const n = referenceNeighbors(grid, w, h, x, y);
      const alive = grid[y * w + x] ? 1 : 0;
      out[y * w + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
    }
  }
  return out;
}

test("nextGeneration matches an independent reference on random grids (all shapes)", () => {
  const shapes = [
    [3, 3],
    [3, 4],
    [4, 3],
    [5, 5],
    [7, 4],
    [13, 9],
    [WIDTH, HEIGHT],
  ];
  for (const [w, h] of shapes) {
    for (let seed = 1; seed <= 4; seed += 1) {
      const grid = randomGrid(w, h, 0.5, mulberry32(seed * 131 + w * 17 + h));
      const actual = nextGeneration(grid, w, h);
      const expected = referenceNext(grid, w, h);
      assert.deepEqual(actual, expected, `shape ${w}x${h} seed ${seed}`);
      assert.ok(actual instanceof Uint8Array);
      assert.equal(actual.length, w * h);
    }
  }
});

test("countNeighbors never counts the center cell itself", () => {
  const grid = createGrid(5, 5);
  grid[gridIndex(5, 2, 2)] = 1;
  assert.equal(countNeighbors(grid, 5, 5, 2, 2), 0);
});

test("countNeighbors wraps a single corner cell to all four corners", () => {
  const grid = createGrid(3, 3);
  grid[gridIndex(3, 0, 0)] = 1;
  // With a 3x3 torus, (1,1)'s eight neighbours are every cell except itself,
  // so the single live corner contributes exactly once.
  assert.equal(countNeighbors(grid, 3, 3, 1, 1), 1);
  // (2,2) is diagonally adjacent to (0,0).
  assert.equal(countNeighbors(grid, 3, 3, 2, 2), 1);
});

test("glider has exact period 4 (no shorter period) and translates by (+1,+1)", () => {
  const w = 20;
  const h = 20;
  const cells = [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ];
  const start = new Uint8Array(w * h);
  for (const [x, y] of cells) start[gridIndex(w, x, y)] = 1;
  const translated = new Uint8Array(w * h);
  for (const [x, y] of cells) translated[gridIndex(w, x + 1, y + 1)] = 1;

  let g = start;
  const seen = [];
  for (let i = 1; i <= 4; i += 1) {
    g = nextGeneration(g, w, h);
    seen.push(Uint8Array.from(g));
  }
  for (let i = 0; i < 3; i += 1) {
    assert.notDeepEqual(seen[i], translated, `generation ${i + 1} should differ`);
  }
  assert.deepEqual(seen[3], translated, "generation 4 must equal the translation");
});

test("randomGrid density bounds: 0 -> all dead, 1 -> all alive", () => {
  assert.equal(countAlive(randomGrid(6, 5, 0, () => 0.999)), 0);
  assert.equal(countAlive(randomGrid(6, 5, 1, () => 0.999)), 30);
  assert.equal(countAlive(randomGrid(6, 5, 1, () => 0)), 30);
});

test("dimension validation rejects a wide range of invalid inputs", () => {
  const bad = [
    [0, 3],
    [3, 0],
    [-1, 5],
    [5, -1],
    [2, 2],
    [3.5, 3],
    [3, 4.2],
    [Number.NaN, 3],
    [3, Number.NaN],
    [Number.POSITIVE_INFINITY, 3],
    ["3", 3],
    [3, null],
  ];
  for (const [w, h] of bad) {
    assert.throws(() => createGrid(w, h), undefined, `createGrid(${w}, ${h})`);
    assert.throws(() => randomGrid(w, h), undefined, `randomGrid(${w}, ${h})`);
  }
  const ok = createGrid(3, 3);
  assert.ok(ok instanceof Uint8Array);
  assert.throws(() => nextGeneration(ok, 2, 3));
  assert.throws(() => nextGeneration(ok, 3, 2));
});

test("history forward returns the stored object on redo (no recompute, no growth)", () => {
  const w = 6;
  const h = 6;
  const base = createGrid(w, h);
  base[gridIndex(w, 2, 2)] = 1;
  base[gridIndex(w, 2, 3)] = 1;
  base[gridIndex(w, 2, 4)] = 1;
  const history = createHistory(base, 10);
  historyForward(history, w, h); // cursor 1, gen 1
  const g2 = historyForward(history, w, h); // cursor 2, gen 2
  historyBack(history); // cursor 1
  const forwardState = history.states[2].grid;
  const redone = historyForward(history, w, h);
  assert.equal(history.states.length, 3, "redo must not append a new state");
  assert.equal(history.cursor, 2);
  assert.equal(redone, forwardState, "redo returns the exact stored forward grid reference");
  assert.deepEqual(redone, g2);
});

test("historyBack at cursor 0 is a no-op", () => {
  const w = 5;
  const h = 5;
  const base = createGrid(w, h);
  const history = createHistory(base, 10);
  const before = history.states.slice();
  assert.equal(historyBack(history), false);
  assert.equal(history.cursor, 0);
  assert.equal(history.states.length, 1);
  assert.equal(history.states[0].grid, before[0].grid);
});

test("history cap boundary: cap states retained, oldest dropped, gens contiguous", () => {
  const w = 5;
  const h = 5;
  const base = createGrid(w, h);
  base[gridIndex(w, 2, 1)] = 1;
  base[gridIndex(w, 2, 2)] = 1;
  base[gridIndex(w, 2, 3)] = 1;
  const cap = 5;

  const history = createHistory(base, cap);
  // cap-1 forwards: the initial state still fits, no trimming yet.
  for (let i = 0; i < cap - 1; i += 1) historyForward(history, w, h);
  assert.equal(history.states.length, cap);
  assert.equal(history.cursor, cap - 1);
  assert.equal(history.states[0].gen, 0);
  assert.equal(history.states[cap - 1].gen, cap - 1);

  // One more forward fills the cap, so the oldest state is dropped immediately.
  historyForward(history, w, h);
  assert.equal(history.states.length, cap);
  assert.equal(history.cursor, cap - 1);
  assert.equal(history.states[0].gen, 1);
  assert.equal(history.states[cap - 1].gen, cap);
  for (let i = 1; i < history.states.length; i += 1) {
    assert.equal(history.states[i].gen, history.states[i - 1].gen + 1);
  }

  // Step back remains consistent after the trim.
  assert.equal(historyBack(history), true);
  assert.equal(history.cursor, cap - 2);
  assert.equal(history.states[history.cursor].gen, cap - 1);
});

test("historyReset keeps the cap configuration and collapses to gen 0", () => {
  const w = 5;
  const h = 5;
  const base = createGrid(w, h);
  const history = createHistory(base, 42);
  historyForward(history, w, h);
  const fresh = createGrid(w, h);
  fresh[gridIndex(w, 1, 1)] = 1;
  historyReset(history, fresh);
  assert.equal(history.cap, 42);
  assert.equal(history.states.length, 1);
  assert.equal(history.cursor, 0);
  assert.equal(history.states[0].gen, 0);
  assert.equal(history.states[0].grid, fresh);
  assert.equal(canStepBack(history), false);
});

test("default HISTORY_CAP is used when createHistory omits the cap argument", () => {
  const w = 4;
  const h = 4;
  const history = createHistory(createGrid(w, h));
  assert.equal(history.cap, HISTORY_CAP);
});
