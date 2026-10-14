import test from "node:test";
import assert from "node:assert/strict";

import {
  createGrid,
  gridIndex,
  countAlive,
  clearGrid,
  stamp,
  patternFits,
  createHistory,
  historyForward,
  historyBack,
  historyPush,
  canStepBack,
} from "../src/game.js";

// Extra QA coverage for the "Очистить поле" / pattern-stamping features.
// These tests probe the branch cases that the developer's suite left uncovered:
// clipping on every edge, negative pattern offsets, strong cap shrinking and the
// interaction between redo truncation and FIFO trimming.

const W = 5;
const H = 5;

function liveAt(grid, width, x, y) {
  return grid[gridIndex(width, x, y)];
}

test("stamp clips on all four edges without wrapping", () => {
  // The dx=1 cell falls off the right edge; the dx=0 cells stay.
  const pattern = { cells: [[0, 0], [1, 0], [0, 1]] };

  const right = stamp(createGrid(W, H), W, H, pattern, W - 1, 0);
  assert.equal(liveAt(right, W, W - 1, 0), 1);
  assert.equal(liveAt(right, W, W - 1, 1), 1);
  assert.equal(countAlive(right), 2, "the cell at dx=1 is clipped away");
  assert.equal(liveAt(right, W, 0, 0), 0, "no wrap to the left edge");
  assert.equal(liveAt(right, W, 0, 1), 0, "no wrap from (1,0)");

  // Bottom edge: the dy=1 cell falls off.
  const bottom = stamp(createGrid(W, H), W, H, pattern, 0, H - 1);
  assert.equal(liveAt(bottom, W, 0, H - 1), 1);
  assert.equal(liveAt(bottom, W, 1, H - 1), 1);
  assert.equal(countAlive(bottom), 2, "the cell at dy=1 is clipped away");
  assert.equal(liveAt(bottom, W, 0, 0), 0, "no wrap to the top edge");

  // Top-left corner with a negative anchor: only dx=1 reaches x=0.
  const topLeft = stamp(createGrid(W, H), W, H, { cells: [[1, 0]] }, -1, 0);
  assert.equal(liveAt(topLeft, W, 0, 0), 1);
  assert.equal(liveAt(topLeft, W, W - 1, 0), 0, "no wrap from x=-1 to the far right");
});

test("stamp honors negative cell offsets by clipping, not wrapping", () => {
  const grid = createGrid(W, H);
  const next = stamp(grid, W, H, { cells: [[-1, 0], [0, 0]] }, 0, 0);
  assert.equal(liveAt(next, W, 0, 0), 1, "the dx=-1 cell is clipped away");
  assert.equal(countAlive(next), 1);

  // A negative offset can also pull a pattern back in when the anchor is past
  // the right edge; the result must still live inside the field.
  const pulled = stamp(createGrid(W, H), W, H, { cells: [[-1, 0]] }, W, 0);
  assert.equal(liveAt(pulled, W, W - 1, 0), 1);
  assert.equal(countAlive(pulled), 1);
});

test("stamp does not mutate the input grid or the pattern", () => {
  const grid = createGrid(W, H);
  grid[gridIndex(W, 2, 2)] = 1;
  const snapshot = Uint8Array.from(grid);
  const cells = [[0, 0], [1, 0]];
  const pattern = { cells };
  const patternSnapshot = JSON.stringify(pattern);

  const next = stamp(grid, W, H, pattern, 0, 0);
  assert.deepEqual(grid, snapshot, "grid must not be mutated");
  assert.equal(JSON.stringify(pattern), patternSnapshot, "pattern must not be mutated");
  assert.notEqual(next, grid);
});

test("patternFits uses inclusive field bounds and reports empty patterns as false", () => {
  const single = { cells: [[0, 0]] };
  assert.equal(patternFits(W, H, single, 0, 0), true);
  assert.equal(patternFits(W, H, single, W - 1, H - 1), true);
  assert.equal(patternFits(W, H, single, W, 0), false, "x==width is outside");
  assert.equal(patternFits(W, H, single, 0, H), false, "y==height is outside");

  // A cell with a negative offset may still reach x=0.
  assert.equal(patternFits(W, H, { cells: [[-1, 0]] }, 1, 0), true);
  assert.equal(patternFits(W, H, { cells: [[-2, 0]] }, 1, 0), false);
  assert.equal(patternFits(W, H, { cells: [] }, 2, 2), false);
});

test("historyPush trims FIFO with a cursor shift when many states are dropped at once", () => {
  const history = createHistory(createGrid(W, H), 1000);
  for (let i = 0; i < 10; i += 1) historyPush(history, createGrid(W, H), i + 1);
  assert.equal(history.states.length, 11);
  assert.equal(history.cursor, 10);

  // Simulate a cap shrinking (e.g. reconfiguration): the next push must drop all
  // overflowing states and keep the cursor on the freshly pushed top state.
  history.cap = 3;
  const top = createGrid(W, H);
  const returned = historyPush(history, top, 99);

  assert.equal(history.states.length, 3);
  assert.equal(history.cursor, 2);
  assert.equal(history.states[2].grid, top);
  assert.equal(returned, history.states[history.cursor].grid);
  // Original gens were [0..10]; trimming nine states keeps [9, 10] plus the new 99.
  assert.deepEqual(history.states.map((state) => state.gen), [9, 10, 99]);
});

test("historyPush combines redo truncation with cap trimming", () => {
  const cap = 3;
  const history = createHistory(createGrid(W, H), cap);
  for (let i = 0; i < 3; i += 1) historyPush(history, createGrid(W, H), i + 1);
  assert.equal(history.states.length, cap);
  assert.equal(history.cursor, cap - 1);

  // Walk back to the oldest state, then push: the redo branch is discarded.
  historyBack(history);
  historyBack(history);
  assert.equal(history.cursor, 0);

  const top = createGrid(W, H);
  historyPush(history, top, 42);
  assert.equal(history.states.length, 2, "redo branch removed, one state appended");
  assert.equal(history.cursor, 1);
  assert.deepEqual(history.states.map((state) => state.gen), [1, 42]);
  assert.equal(canStepBack(history), true);

  // Now fill the cap and confirm the top is still the pushed state.
  for (let i = 0; i < 3; i += 1) historyPush(history, createGrid(W, H), 100 + i);
  assert.equal(history.states.length, cap);
  assert.equal(history.cursor, cap - 1);
  assert.equal(history.states[cap - 1].gen, 102);
});

test("stamping never changes the current generation when pushed without gen", () => {
  const history = createHistory(createGrid(W, H), 10);
  historyForward(history, W, H);
  historyForward(history, W, H); // gen 2
  assert.equal(history.states[history.cursor].gen, 2);

  const stamped = createGrid(W, H);
  stamped[gridIndex(W, 1, 1)] = 1;
  historyPush(history, stamped);
  assert.equal(history.states[history.cursor].gen, 2, "edits must not advance gen");

  historyForward(history, W, H);
  assert.equal(history.states[history.cursor].gen, 3, "the next forward resumes gen+1");
});

test("clearGrid keeps the array shape and never aliases the input", () => {
  const grid = createGrid(4, 3);
  grid.fill(1);
  const cleared = clearGrid(grid);
  assert.ok(cleared instanceof Uint8Array);
  assert.equal(cleared.length, grid.length);
  assert.equal(countAlive(cleared), 0);
  assert.notEqual(cleared, grid);
  assert.equal(countAlive(grid), grid.length, "source stays untouched");

  // Clearing an already empty grid is idempotent.
  const empty = createGrid(4, 3);
  const again = clearGrid(empty);
  assert.equal(countAlive(again), 0);
  assert.notEqual(again, empty);
});
