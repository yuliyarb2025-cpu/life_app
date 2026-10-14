export const WIDTH = 200;
export const HEIGHT = 100;
export const RANDOM_DENSITY = 0.5;
export const BOUNDARY = "wrap";
export const HISTORY_CAP = 1000;

function validateDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error("width and height must be integers");
  }
  if (width < 3 || height < 3) {
    throw new Error("width and height must be >= 3");
  }
}

export function createGrid(width, height) {
  validateDimensions(width, height);
  return new Uint8Array(width * height);
}

export function gridIndex(width, x, y) {
  return y * width + x;
}

export function countNeighbors(grid, width, height, x, y) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = (x + dx + width) % width;
      const ny = (y + dy + height) % height;
      count += grid[ny * width + nx];
    }
  }
  return count;
}

export function nextGeneration(grid, width, height) {
  validateDimensions(width, height);
  const next = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const alive = grid[idx];
      const neighbors = countNeighbors(grid, width, height, x, y);
      if (alive) {
        next[idx] = neighbors === 2 || neighbors === 3 ? 1 : 0;
      } else {
        next[idx] = neighbors === 3 ? 1 : 0;
      }
    }
  }
  return next;
}

export function randomGrid(width, height, density = RANDOM_DENSITY, rng = Math.random) {
  validateDimensions(width, height);
  const grid = new Uint8Array(width * height);
  for (let i = 0; i < grid.length; i += 1) {
    grid[i] = rng() < density ? 1 : 0;
  }
  return grid;
}

export function countAlive(grid) {
  let count = 0;
  for (let i = 0; i < grid.length; i += 1) {
    count += grid[i];
  }
  return count;
}

export function clearGrid(grid) {
  return new Uint8Array(grid.length);
}

function validatePattern(pattern) {
  if (!pattern || !Array.isArray(pattern.cells)) {
    throw new Error("pattern.cells must be an array");
  }
}

export function stamp(grid, width, height, pattern, x, y) {
  validateDimensions(width, height);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error("x and y must be integers");
  }
  validatePattern(pattern);
  const next = Uint8Array.from(grid);
  for (const [dx, dy] of pattern.cells) {
    const cx = x + dx;
    const cy = y + dy;
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
    next[cy * width + cx] = 1;
  }
  return next;
}

export function patternFits(width, height, pattern, x, y) {
  validateDimensions(width, height);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error("x and y must be integers");
  }
  validatePattern(pattern);
  for (const [dx, dy] of pattern.cells) {
    const cx = x + dx;
    const cy = y + dy;
    if (cx >= 0 && cx < width && cy >= 0 && cy < height) return true;
  }
  return false;
}

export function createHistory(initialGrid, cap = HISTORY_CAP) {
  return {
    states: [{ grid: initialGrid, gen: 0 }],
    cursor: 0,
    cap,
  };
}

export function historyForward(history, width, height) {
  if (history.cursor < history.states.length - 1) {
    history.cursor += 1;
    return history.states[history.cursor].grid;
  }
  const current = history.states[history.cursor];
  const grid = nextGeneration(current.grid, width, height);
  history.states.push({ grid, gen: current.gen + 1 });
  history.cursor = history.states.length - 1;
  if (history.cap > 0 && history.states.length > history.cap) {
    const removed = history.states.length - history.cap;
    history.states.splice(0, removed);
    history.cursor -= removed;
  }
  return history.states[history.cursor].grid;
}

export function historyPush(history, grid, gen) {
  history.states = history.states.slice(0, history.cursor + 1);
  const current = history.states[history.cursor];
  history.states.push({ grid, gen: gen ?? current.gen });
  history.cursor = history.states.length - 1;
  if (history.cap > 0 && history.states.length > history.cap) {
    const removed = history.states.length - history.cap;
    history.states.splice(0, removed);
    history.cursor -= removed;
  }
  return history.states[history.cursor].grid;
}

export function historyBack(history) {
  if (history.cursor === 0) return false;
  history.cursor -= 1;
  return true;
}

export function historyReset(history, grid) {
  history.states = [{ grid, gen: 0 }];
  history.cursor = 0;
  return history;
}

export function canStepBack(history) {
  return history.cursor > 0;
}
