import {
  WIDTH,
  HEIGHT,
  RANDOM_DENSITY,
  HISTORY_CAP,
  randomGrid,
  countAlive,
  clearGrid,
  stamp,
  createHistory,
  historyForward,
  historyBack,
  historyReset,
  historyPush,
  canStepBack,
} from "./game.js";
import { PATTERNS, parsePattern } from "./patterns.js";

export const CELL_SIZE = 4;
export const TICK_MS = 100;
export const CELL_ICON = 6;
export const COLOR_ALIVE = "#3ddc84";
export const COLOR_DEAD = "#101418";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const genCounterEl = document.getElementById("gen-counter");
const populationEl = document.getElementById("population");
const runStateEl = document.getElementById("run-state");
const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnForward = document.getElementById("btn-forward");
const btnBack = document.getElementById("btn-back");
const btnGenerate = document.getElementById("btn-generate");
const btnClear = document.getElementById("btn-clear");
const patternListEl = document.getElementById("pattern-list");

const displayWidth = WIDTH * CELL_SIZE;
const displayHeight = HEIGHT * CELL_SIZE;
canvas.width = displayWidth;
canvas.height = displayHeight;

const imageData = ctx.createImageData(displayWidth, displayHeight);

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const ALIVE_RGB = hexToRgb(COLOR_ALIVE);
const DEAD_RGB = hexToRgb(COLOR_DEAD);

let grid;
let history;
let running = false;
let timerId = null;

let patternItems = [];
let dragPattern = null;
let preview = null;

export function pointToCell(clientX, clientY, rect, gridWidth, gridHeight) {
  if (!rect || !rect.width || !rect.height) return null;
  const fx = (clientX - rect.left) / rect.width;
  const fy = (clientY - rect.top) / rect.height;
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null;
  const x = Math.floor(fx * gridWidth);
  const y = Math.floor(fy * gridHeight);
  if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return null;
  return { x, y };
}

export function anchorForPattern(cellX, cellY, patternWidth, patternHeight) {
  return {
    x: cellX - Math.floor((patternWidth - 1) / 2),
    y: cellY - Math.floor((patternHeight - 1) / 2),
  };
}

const parsedPatterns = PATTERNS.map(parsePattern);
const patternById = new Map(parsedPatterns.map((pattern) => [pattern.id, pattern]));

function render() {
  const data = imageData.data;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const [r, g, b] = grid[y * WIDTH + x] ? ALIVE_RGB : DEAD_RGB;
      for (let py = 0; py < CELL_SIZE; py += 1) {
        let offset = ((y * CELL_SIZE + py) * displayWidth + x * CELL_SIZE) * 4;
        for (let px = 0; px < CELL_SIZE; px += 1) {
          data[offset] = r;
          data[offset + 1] = g;
          data[offset + 2] = b;
          data[offset + 3] = 255;
          offset += 4;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  if (preview) drawPreview(preview);
}

function drawPreview(bounds) {
  const { x0, y0, x1, y1 } = bounds;
  ctx.fillStyle = "rgba(61, 220, 132, 0.25)";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = COLOR_ALIVE;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

function drawPatternIcon(iconCanvas, pattern) {
  const iconCtx = iconCanvas.getContext("2d");
  if (!iconCtx) return;
  iconCtx.fillStyle = COLOR_DEAD;
  iconCtx.fillRect(0, 0, iconCanvas.width, iconCanvas.height);
  iconCtx.fillStyle = COLOR_ALIVE;
  for (const [dx, dy] of pattern.cells) {
    iconCtx.fillRect(dx * CELL_ICON, dy * CELL_ICON, CELL_ICON, CELL_ICON);
  }
}

function buildPalette() {
  if (!patternListEl || typeof document.createElement !== "function") return;
  patternItems = parsedPatterns.map((pattern) => {
    const item = document.createElement("div");
    item.className = "pattern-item";
    item.dataset.patternId = pattern.id;
    item.draggable = true;
    item.setAttribute("aria-label", pattern.name);
    item.title = pattern.name;

    const icon = document.createElement("canvas");
    icon.className = "pattern-icon";
    icon.width = pattern.width * CELL_ICON;
    icon.height = pattern.height * CELL_ICON;
    drawPatternIcon(icon, pattern);

    const label = document.createElement("span");
    label.className = "pattern-name";
    label.textContent = pattern.name;

    item.appendChild(icon);
    item.appendChild(label);
    item.addEventListener("dragstart", (event) => onPatternDragStart(event, pattern));
    item.addEventListener("dragend", onPatternDragEnd);
    patternListEl.appendChild(item);
    return item;
  });
}

function onPatternDragStart(event, pattern) {
  dragPattern = pattern;
  if (running) {
    if (event.preventDefault) event.preventDefault();
    return;
  }
  if (event.dataTransfer) event.dataTransfer.setData("text/plain", pattern.id);
}

function onPatternDragEnd() {
  dragPattern = null;
  clearPreview();
}

function resolveDragPattern(event) {
  if (
    event &&
    event.dataTransfer &&
    typeof event.dataTransfer.getData === "function"
  ) {
    const id = event.dataTransfer.getData("text/plain");
    if (id && patternById.has(id)) return patternById.get(id);
  }
  return dragPattern;
}

function clearPreview() {
  if (!preview) return;
  preview = null;
  render();
}

function onCanvasDragOver(event) {
  if (event.preventDefault) event.preventDefault();
  if (running) return;
  const pattern = resolveDragPattern(event);
  if (!pattern) return;
  const cell = pointToCell(
    event.clientX,
    event.clientY,
    canvas.getBoundingClientRect(),
    WIDTH,
    HEIGHT,
  );
  if (!cell) {
    clearPreview();
    return;
  }
  const anchor = anchorForPattern(cell.x, cell.y, pattern.width, pattern.height);
  preview = {
    x0: Math.max(0, anchor.x) * CELL_SIZE,
    y0: Math.max(0, anchor.y) * CELL_SIZE,
    x1: (Math.min(WIDTH - 1, anchor.x + pattern.width - 1) + 1) * CELL_SIZE,
    y1: (Math.min(HEIGHT - 1, anchor.y + pattern.height - 1) + 1) * CELL_SIZE,
  };
  render();
}

function onCanvasDragLeave() {
  clearPreview();
}

function onCanvasDrop(event) {
  if (event.preventDefault) event.preventDefault();
  const hadPreview = preview !== null;
  preview = null;
  if (running) return;
  const pattern = resolveDragPattern(event);
  if (!pattern) {
    if (hadPreview) render();
    return;
  }
  const cell = pointToCell(
    event.clientX,
    event.clientY,
    canvas.getBoundingClientRect(),
    WIDTH,
    HEIGHT,
  );
  if (!cell) {
    if (hadPreview) render();
    return;
  }
  const anchor = anchorForPattern(cell.x, cell.y, pattern.width, pattern.height);
  const next = stamp(grid, WIDTH, HEIGHT, pattern, anchor.x, anchor.y);
  if (!gridsEqual(grid, next)) {
    grid = historyPush(history, next);
    refresh();
    return;
  }
  if (hadPreview) render();
}

function gridsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function currentState() {
  return history.states[history.cursor];
}

function syncGrid() {
  grid = currentState().grid;
}

function updateStatus() {
  genCounterEl.textContent = `Поколение: ${currentState().gen}`;
  populationEl.textContent = `Живых: ${countAlive(grid)}`;
  runStateEl.textContent = running
    ? "Состояние: идёт эволюция"
    : "Состояние: остановлено";
}

function updateButtons() {
  btnStart.disabled = running;
  btnStop.disabled = !running;
  btnForward.disabled = running;
  btnBack.disabled = running || !canStepBack(history);
  btnGenerate.disabled = running;
  if (btnClear) btnClear.disabled = running;
  for (const item of patternItems) {
    item.draggable = !running;
    item.classList.toggle("is-disabled", running);
  }
}

function refresh() {
  render();
  updateStatus();
  updateButtons();
}

function stopLoop() {
  running = false;
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function tick() {
  if (!running) return;
  historyForward(history, WIDTH, HEIGHT);
  syncGrid();
  refresh();
  timerId = setTimeout(tick, TICK_MS);
}

function start() {
  if (running) return;
  running = true;
  updateButtons();
  updateStatus();
  timerId = setTimeout(tick, TICK_MS);
}

function stop() {
  stopLoop();
  refresh();
}

function stepForward() {
  if (running) return;
  historyForward(history, WIDTH, HEIGHT);
  syncGrid();
  refresh();
}

function stepBack() {
  if (running) return;
  if (historyBack(history)) {
    syncGrid();
    refresh();
  }
}

function generate() {
  if (running) return;
  grid = randomGrid(WIDTH, HEIGHT, RANDOM_DENSITY);
  historyReset(history, grid);
  refresh();
}

function clearField() {
  if (running) return;
  grid = clearGrid(grid);
  historyReset(history, grid);
  refresh();
}

function init() {
  grid = randomGrid(WIDTH, HEIGHT, RANDOM_DENSITY);
  history = createHistory(grid, HISTORY_CAP);
  buildPalette();
  btnStart.addEventListener("click", start);
  btnStop.addEventListener("click", stop);
  btnForward.addEventListener("click", stepForward);
  btnBack.addEventListener("click", stepBack);
  btnGenerate.addEventListener("click", generate);
  if (btnClear) btnClear.addEventListener("click", clearField);
  canvas.addEventListener("dragover", onCanvasDragOver);
  canvas.addEventListener("dragleave", onCanvasDragLeave);
  canvas.addEventListener("drop", onCanvasDrop);
  refresh();
}

init();
