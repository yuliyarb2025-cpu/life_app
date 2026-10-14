import test from "node:test";
import assert from "node:assert/strict";

import { PATTERNS, parsePattern } from "../src/patterns.js";
import { nextGeneration } from "../src/game.js";

const EXPECTED_IDS = ["glider", "toad", "pulsar", "lwss", "gosper-gun"];

function byId(id) {
  const pattern = PATTERNS.find((entry) => entry.id === id);
  assert.ok(pattern, `missing pattern ${id}`);
  return pattern;
}

function place(width, height, cells, offsetX = 0, offsetY = 0) {
  const grid = new Uint8Array(width * height);
  for (const [x, y] of cells) {
    grid[(y + offsetY) * width + (x + offsetX)] = 1;
  }
  return grid;
}

function shift(cells, dx, dy) {
  return cells.map(([x, y]) => [x + dx, y + dy]);
}

function isEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

test("PATTERNS exposes the five expected unique ids", () => {
  assert.equal(PATTERNS.length, 5);
  assert.deepEqual(
    PATTERNS.map((pattern) => pattern.id),
    EXPECTED_IDS,
  );
  assert.equal(new Set(PATTERNS.map((pattern) => pattern.id)).size, 5);
});

test("every pattern has a non-empty name and rectangular, non-empty rows", () => {
  for (const pattern of PATTERNS) {
    assert.equal(typeof pattern.name, "string", `${pattern.id} name`);
    assert.ok(pattern.name.trim().length > 0, `${pattern.id} name must not be blank`);
    assert.ok(Array.isArray(pattern.rows), `${pattern.id} rows`);
    assert.ok(pattern.rows.length > 0, `${pattern.id} rows must not be empty`);
    const width = pattern.rows[0].length;
    assert.ok(width > 0, `${pattern.id} first row must not be empty`);
    for (const row of pattern.rows) {
      assert.equal(row.length, width, `${pattern.id} rows must be rectangular`);
      assert.match(row, /^[01]+$/, `${pattern.id} rows may only contain 0/1`);
    }
  }
});

test("parsePattern reports dimensions and the live cell count", () => {
  const expected = {
    glider: { width: 3, height: 3, cells: 5 },
    toad: { width: 4, height: 2, cells: 6 },
    pulsar: { width: 13, height: 13, cells: 48 },
    lwss: { width: 5, height: 4, cells: 9 },
    "gosper-gun": { width: 36, height: 9, cells: 36 },
  };

  for (const pattern of PATTERNS) {
    const parsed = parsePattern(pattern);
    assert.equal(parsed.id, pattern.id);
    assert.equal(parsed.name, pattern.name);
    assert.equal(parsed.width, expected[pattern.id].width, `${pattern.id} width`);
    assert.equal(parsed.height, expected[pattern.id].height, `${pattern.id} height`);
    assert.equal(parsed.cells.length, expected[pattern.id].cells, `${pattern.id} cells`);
    for (const [x, y] of parsed.cells) {
      assert.ok(x >= 0 && x < parsed.width, `${pattern.id} cell x in range`);
      assert.ok(y >= 0 && y < parsed.height, `${pattern.id} cell y in range`);
    }
  }
});

test("gosper gun emits one glider every 30 generations", () => {
  const parsed = parsePattern(byId("gosper-gun"));
  const width = 70;
  const height = 70;
  let grid = place(width, height, parsed.cells, 2, 2);
  assert.equal(parsed.cells.length, 36, "gun starts with 36 live cells");

  const populations = [];
  for (let i = 1; i <= 90; i += 1) {
    grid = nextGeneration(grid, width, height);
    if (i % 30 === 0) populations.push(countLive(grid));
  }
  assert.deepEqual(populations, [41, 46, 51], "population grows by one glider per period of 30");
});

function countLive(grid) {
  let total = 0;
  for (let i = 0; i < grid.length; i += 1) total += grid[i];
  return total;
}

test("glider translates by (+1,+1) over 4 generations", () => {
  const parsed = parsePattern(byId("glider"));
  const width = 20;
  const height = 20;
  let grid = place(width, height, parsed.cells, 2, 2);
  for (let i = 0; i < 4; i += 1) {
    grid = nextGeneration(grid, width, height);
  }
  const expected = place(width, height, shift(parsed.cells, 1, 1), 2, 2);
  assert.ok(isEqual(grid, expected));
});

test("toad oscillates with period 2", () => {
  const parsed = parsePattern(byId("toad"));
  const width = parsed.width + 4;
  const height = parsed.height + 4;
  const grid = place(width, height, parsed.cells, 2, 2);
  const g1 = nextGeneration(grid, width, height);
  assert.ok(!isEqual(g1, grid), "generation 1 must differ");
  assert.ok(isEqual(nextGeneration(g1, width, height), grid), "period must be 2");
});

test("pulsar oscillates with period 3", () => {
  const parsed = parsePattern(byId("pulsar"));
  const width = parsed.width + 6;
  const height = parsed.height + 6;
  const grid = place(width, height, parsed.cells, 3, 3);
  let current = grid;
  for (let i = 1; i <= 2; i += 1) {
    current = nextGeneration(current, width, height);
    assert.ok(!isEqual(current, grid), `generation ${i} must differ`);
  }
  current = nextGeneration(current, width, height);
  assert.ok(isEqual(current, grid), "period must be 3");
});

test("lwss translates by 2 cells horizontally over 4 generations", () => {
  const parsed = parsePattern(byId("lwss"));
  const width = 40;
  const height = 20;
  let grid = place(width, height, parsed.cells, 6, 6);
  for (let i = 0; i < 4; i += 1) {
    grid = nextGeneration(grid, width, height);
  }
  const expected = place(width, height, shift(parsed.cells, -2, 0), 6, 6);
  assert.ok(isEqual(grid, expected), "lwss must shift 2 cells sideways");
});

test("lwss has exact period 4 (no shorter cycle) and shifts only horizontally", () => {
  const parsed = parsePattern(byId("lwss"));
  const width = 40;
  const height = 20;
  const start = place(width, height, parsed.cells, 6, 6);

  let current = start;
  const generations = [];
  for (let i = 1; i <= 4; i += 1) {
    current = nextGeneration(current, width, height);
    generations.push(Uint8Array.from(current));
  }

  // No generation before the fourth may look like the start (possibly shifted),
  // which would indicate a shorter period.
  const smallShifts = [
    [0, 0],
    [-1, 0],
    [-2, 0],
    [0, -1],
    [0, -2],
  ];
  for (let i = 0; i < 3; i += 1) {
    for (const [dx, dy] of smallShifts) {
      const candidate = place(width, height, shift(parsed.cells, dx, dy), 6, 6);
      assert.ok(
        !isEqual(generations[i], candidate),
        `generation ${i + 1} must not match a translation (${dx},${dy})`,
      );
    }
  }

  // The fourth generation is the start translated left by two, and the
  // displacement must be purely horizontal.
  const translated = place(width, height, shift(parsed.cells, -2, 0), 6, 6);
  assert.ok(isEqual(generations[3], translated), "generation 4 must equal the (-2,0) shift");
  const vertical = place(width, height, shift(parsed.cells, 0, -2), 6, 6);
  assert.ok(!isEqual(generations[3], vertical), "displacement must not be vertical");
});
