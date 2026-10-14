import test from "node:test";
import assert from "node:assert/strict";

import {
  WIDTH,
  HEIGHT,
  RANDOM_DENSITY,
  BOUNDARY,
  HISTORY_CAP,
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
} from "../src/game.js";

const MOORE_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function putCells(grid, width, cells) {
  for (const [x, y] of cells) {
    grid[gridIndex(width, x, y)] = 1;
  }
  return grid;
}

test("spec constants are set", () => {
  assert.equal(WIDTH, 200);
  assert.equal(HEIGHT, 100);
  assert.equal(RANDOM_DENSITY, 0.5);
  assert.equal(BOUNDARY, "wrap");
  assert.equal(HISTORY_CAP, 1000);
});

test("createGrid returns a zero-filled Uint8Array of the right length", () => {
  const grid = createGrid(5, 4);
  assert.ok(grid instanceof Uint8Array);
  assert.equal(grid.length, 20);
  assert.ok(grid.every((value) => value === 0));
});

test("gridIndex is row-major", () => {
  assert.equal(gridIndex(5, 0, 0), 0);
  assert.equal(gridIndex(5, 3, 0), 3);
  assert.equal(gridIndex(5, 0, 1), 5);
  assert.equal(gridIndex(5, 2, 3), 17);
});

test("countNeighbors counts all eight Moore neighbors", () => {
  const width = 5;
  const height = 5;
  const grid = createGrid(width, height);
  putCells(grid, width, MOORE_OFFSETS.map(([dx, dy]) => [2 + dx, 2 + dy]));
  assert.equal(countNeighbors(grid, width, height, 2, 2), 8);
});

test("countNeighbors wraps toroidally (0,0 sees (W-1,H-1))", () => {
  const width = 5;
  const height = 5;
  const grid = createGrid(width, height);
  grid[gridIndex(width, width - 1, height - 1)] = 1;
  assert.equal(countNeighbors(grid, width, height, 0, 0), 1);

  grid[gridIndex(width, width - 1, 0)] = 1;
  grid[gridIndex(width, 0, height - 1)] = 1;
  assert.equal(countNeighbors(grid, width, height, 0, 0), 3);
});

test("nextGeneration follows B3/S23 for every neighborhood", () => {
  const width = 3;
  const height = 3;
  for (let alive = 0; alive <= 1; alive += 1) {
    for (let n = 0; n <= 8; n += 1) {
      const grid = createGrid(width, height);
      grid[gridIndex(width, 1, 1)] = alive;
      for (let i = 0; i < n; i += 1) {
        const [dx, dy] = MOORE_OFFSETS[i];
        grid[gridIndex(width, 1 + dx, 1 + dy)] = 1;
      }
      const next = nextGeneration(grid, width, height);
      const expected = (alive === 1 && (n === 2 || n === 3)) || (alive === 0 && n === 3) ? 1 : 0;
      assert.equal(next[gridIndex(width, 1, 1)], expected, `alive=${alive} n=${n}`);
    }
  }
});

test("nextGeneration is pure: input untouched, new array returned", () => {
  const width = 5;
  const height = 5;
  const grid = putCells(createGrid(width, height), width, [
    [1, 2],
    [2, 2],
    [3, 2],
  ]);
  const snapshot = Uint8Array.from(grid);
  const next = nextGeneration(grid, width, height);
  assert.deepEqual(grid, snapshot);
  assert.notEqual(next, grid);
  assert.notDeepEqual(next, grid);
});

test("block is stable", () => {
  const width = 6;
  const height = 6;
  const grid = putCells(createGrid(width, height), width, [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ]);
  assert.deepEqual(nextGeneration(grid, width, height), grid);
});

test("blinker oscillates with period 2", () => {
  const width = 6;
  const height = 6;
  const grid = putCells(createGrid(width, height), width, [
    [2, 1],
    [2, 2],
    [2, 3],
  ]);
  const g1 = nextGeneration(grid, width, height);
  const g2 = nextGeneration(g1, width, height);
  assert.notDeepEqual(g1, grid);
  assert.deepEqual(g2, grid);
});

test("glider translates by (+1,+1) over 4 generations", () => {
  const width = 20;
  const height = 20;
  const cells = [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ];
  let grid = putCells(createGrid(width, height), width, cells);
  for (let i = 0; i < 4; i += 1) {
    grid = nextGeneration(grid, width, height);
  }
  const expected = putCells(
    createGrid(width, height),
    width,
    cells.map(([x, y]) => [x + 1, y + 1]),
  );
  assert.deepEqual(grid, expected);
});

test("empty field stays empty", () => {
  const next = nextGeneration(createGrid(5, 5), 5, 5);
  assert.equal(countAlive(next), 0);
});

test("full field dies out", () => {
  const width = 5;
  const height = 5;
  const grid = createGrid(width, height);
  grid.fill(1);
  assert.equal(countAlive(nextGeneration(grid, width, height)), 0);
});

test("randomGrid is deterministic with an injected rng", () => {
  const a = randomGrid(10, 10, 0.5, seededRng(42));
  const b = randomGrid(10, 10, 0.5, seededRng(42));
  const c = randomGrid(10, 10, 0.5, seededRng(43));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("randomGrid respects the density threshold", () => {
  assert.equal(countAlive(randomGrid(5, 5, 0.5, () => 0.4)), 25);
  assert.equal(countAlive(randomGrid(5, 5, 0.5, () => 0.5)), 0);
});

test("countAlive sums live cells", () => {
  assert.equal(countAlive(Uint8Array.from([1, 0, 1, 1, 0])), 3);
});

test("dimension validation rejects invalid sizes", () => {
  assert.throws(() => createGrid(2, 3));
  assert.throws(() => createGrid(3, 2));
  assert.throws(() => createGrid(3.5, 3));
  assert.throws(() => createGrid(3, Number.NaN));
  assert.throws(() => randomGrid(3, 2));
  assert.throws(() => nextGeneration(createGrid(3, 3), 2, 3));
});

test("history walks forward, redoes and steps back", () => {
  const width = 6;
  const height = 6;
  const grid = putCells(createGrid(width, height), width, [
    [2, 1],
    [2, 2],
    [2, 3],
  ]);
  const history = createHistory(grid, 10);
  assert.equal(history.cursor, 0);
  assert.equal(history.states.length, 1);
  assert.equal(canStepBack(history), false);

  const g1 = historyForward(history, width, height);
  assert.equal(history.cursor, 1);
  assert.deepEqual(g1, nextGeneration(grid, width, height));
  assert.equal(history.states[1].gen, 1);
  assert.equal(canStepBack(history), true);

  const g2 = historyForward(history, width, height);
  assert.equal(history.states[2].gen, 2);

  assert.equal(historyBack(history), true);
  assert.equal(history.cursor, 1);
  const redone = historyForward(history, width, height);
  assert.equal(history.states.length, 3);
  assert.deepEqual(redone, g2);

  assert.equal(historyBack(history), true);
  assert.equal(historyBack(history), true);
  assert.equal(historyBack(history), false);
  assert.equal(history.cursor, 0);
  assert.equal(canStepBack(history), false);
});

test("history drops oldest states on overflow (FIFO) and keeps gen", () => {
  const width = 6;
  const height = 6;
  const grid = putCells(createGrid(width, height), width, [
    [2, 1],
    [2, 2],
    [2, 3],
  ]);
  const history = createHistory(grid, 3);
  for (let i = 0; i < 5; i += 1) {
    historyForward(history, width, height);
  }
  assert.equal(history.states.length, 3);
  assert.equal(history.cursor, 2);
  assert.equal(history.states[0].gen, 3);
  assert.equal(history.states[2].gen, 5);
});

test("historyReset collapses history to a single fresh state", () => {
  const width = 6;
  const height = 6;
  const grid = putCells(createGrid(width, height), width, [
    [2, 1],
    [2, 2],
    [2, 3],
  ]);
  const history = createHistory(grid, 10);
  historyForward(history, width, height);
  historyForward(history, width, height);

  const fresh = randomGrid(width, height, 0.5, seededRng(7));
  historyReset(history, fresh);
  assert.equal(history.states.length, 1);
  assert.equal(history.cursor, 0);
  assert.equal(history.states[0].gen, 0);
  assert.equal(history.states[0].grid, fresh);
  assert.equal(canStepBack(history), false);
});
