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

test("clearGrid returns a new zeroed array and does not mutate its input", () => {
  const grid = createGrid(4, 3);
  grid[0] = 1;
  grid[5] = 1;
  const snapshot = Uint8Array.from(grid);

  const cleared = clearGrid(grid);
  assert.ok(cleared instanceof Uint8Array);
  assert.equal(cleared.length, grid.length);
  assert.ok(cleared.every((value) => value === 0));
  assert.notEqual(cleared, grid);
  assert.deepEqual(grid, snapshot, "input must not be mutated");
  assert.equal(countAlive(cleared), 0);
});

test("stamp is a union: existing live cells survive and pattern cells are added", () => {
  const width = 6;
  const height = 6;
  const grid = createGrid(width, height);
  grid[gridIndex(width, 3, 3)] = 1;
  const pattern = { cells: [[0, 0], [1, 0], [0, 1]] };

  const next = stamp(grid, width, height, pattern, 1, 1);
  assert.equal(next[gridIndex(width, 3, 3)], 1, "untouched live cell survives");
  assert.equal(next[gridIndex(width, 1, 1)], 1);
  assert.equal(next[gridIndex(width, 2, 1)], 1);
  assert.equal(next[gridIndex(width, 1, 2)], 1);
  assert.equal(grid[gridIndex(width, 1, 1)], 0, "input not mutated");
});

test("stamp is pure: returns a new array, leaves the input intact", () => {
  const width = 5;
  const height = 5;
  const grid = createGrid(width, height);
  grid[gridIndex(width, 0, 0)] = 1;
  const snapshot = Uint8Array.from(grid);

  const next = stamp(grid, width, height, { cells: [[2, 2]] }, 1, 1);
  assert.notEqual(next, grid);
  assert.deepEqual(grid, snapshot);
  assert.equal(next[gridIndex(width, 3, 3)], 1);
});

test("stamp clips at the borders without wrapping", () => {
  const width = 5;
  const height = 5;
  const pattern = { cells: [[0, 0], [1, 0]] };

  // Anchor at the right edge: the second cell falls off and must not wrap to x=0.
  const right = stamp(createGrid(width, height), width, height, pattern, width - 1, 0);
  assert.equal(right[gridIndex(width, width - 1, 0)], 1);
  assert.equal(right[gridIndex(width, 0, 0)], 0, "no toroidal wrap on the right edge");

  // Anchor at x=-1: only the shifted cell fits at x=0.
  const left = stamp(createGrid(width, height), width, height, pattern, -1, 0);
  assert.equal(left[gridIndex(width, 0, 0)], 1);
  assert.equal(left[gridIndex(width, width - 1, 0)], 0, "no wrap to the far edge");
});

test("stamp fully outside the field returns an unchanged copy", () => {
  const width = 5;
  const height = 5;
  const grid = createGrid(width, height);
  grid[gridIndex(width, 2, 2)] = 1;

  const next = stamp(grid, width, height, { cells: [[0, 0], [1, 1]] }, 20, -10);
  assert.deepEqual(next, grid);
  assert.notEqual(next, grid);
});

test("stamp validates dimensions, coordinates and pattern.cells", () => {
  const grid = createGrid(5, 5);
  const pattern = { cells: [[0, 0]] };
  assert.throws(() => stamp(grid, 2, 5, pattern, 0, 0));
  assert.throws(() => stamp(grid, 5, 5, pattern, 0.5, 0));
  assert.throws(() => stamp(grid, 5, 5, pattern, 0, -1.2));
  assert.throws(() => stamp(grid, 5, 5, { cells: "nope" }, 0, 0));
  assert.throws(() => stamp(grid, 5, 5, null, 0, 0));
});

test("patternFits reports whether any cell lands inside the field", () => {
  const pattern = { cells: [[0, 0], [1, 0]] };
  assert.equal(patternFits(5, 5, pattern, 0, 0), true);
  assert.equal(patternFits(5, 5, pattern, 4, 0), true, "one cell still fits");

  const shifted = { cells: [[1, 0]] };
  assert.equal(patternFits(5, 5, shifted, -1, 0), true, "shifted cell reaches x=0");
  assert.equal(patternFits(5, 5, shifted, 5, 0), false, "entirely past the right edge");
  assert.equal(patternFits(5, 5, pattern, -10, 0), false);
  assert.equal(patternFits(5, 5, { cells: [] }, 0, 0), false);
});

test("historyPush truncates the redo branch before appending", () => {
  const width = 5;
  const height = 5;
  const history = createHistory(createGrid(width, height), 10);
  historyForward(history, width, height);
  historyForward(history, width, height);
  assert.equal(history.states.length, 3);
  historyBack(history);
  assert.equal(history.cursor, 1);

  const stamped = createGrid(width, height);
  stamped[gridIndex(width, 1, 1)] = 1;
  const returned = historyPush(history, stamped, 7);

  assert.equal(history.states.length, 3, "redo branch removed then one state appended");
  assert.equal(history.cursor, 2);
  assert.equal(history.states[2].grid, stamped);
  assert.equal(history.states[2].gen, 7);
  assert.equal(returned, stamped);
});

test("historyPush defaults gen to the current state's generation", () => {
  const width = 5;
  const height = 5;
  const history = createHistory(createGrid(width, height), 10);

  const first = createGrid(width, height);
  historyPush(history, first);
  assert.equal(history.states[1].gen, 0, "defaults to current gen (0)");

  historyForward(history, width, height); // cursor 2, gen 1
  const second = createGrid(width, height);
  historyPush(history, second);
  assert.equal(history.states[history.cursor].gen, 1, "defaults to current gen (1)");
  assert.equal(canStepBack(history), true);
});

test("historyPush applies FIFO cap trimming", () => {
  const width = 5;
  const height = 5;
  const cap = 3;
  const history = createHistory(createGrid(width, height), cap);

  for (let i = 0; i < 5; i += 1) {
    const next = createGrid(width, height);
    next[gridIndex(width, i, 0)] = 1;
    historyPush(history, next, i + 1);
  }

  assert.equal(history.states.length, cap);
  assert.equal(history.cursor, cap - 1);
  assert.equal(history.states[0].gen, 3);
  assert.equal(history.states[cap - 1].gen, 5);
});
