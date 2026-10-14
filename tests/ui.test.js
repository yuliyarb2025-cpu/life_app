import test from "node:test";
import assert from "node:assert/strict";

// Minimal DOM + timer harness so src/ui.js can be exercised in Node with no
// external dependencies. Each test gets a fresh module instance via a unique
// query string so module-global state (grid/history/running/timerId) is isolated.

const BUTTON_IDS = [
  "btn-start",
  "btn-stop",
  "btn-forward",
  "btn-back",
  "btn-generate",
  "btn-clear",
];
const ELEMENT_IDS = [
  ...BUTTON_IDS,
  "board",
  "gen-counter",
  "population",
  "run-state",
  "palette",
  "pattern-list",
];

const PATTERN_IDS = ["glider", "toad", "pulsar", "lwss", "gosper-gun"];

function makeClassList(el) {
  return {
    add(name) {
      el._classes.add(name);
    },
    remove(name) {
      el._classes.delete(name);
    },
    contains(name) {
      return el._classes.has(name);
    },
    toggle(name, force) {
      const has = el._classes.has(name);
      const on = force === undefined ? !has : Boolean(force);
      if (on) el._classes.add(name);
      else el._classes.delete(name);
      return on;
    },
  };
}

function makeElement(id) {
  const el = {
    id: id ?? "",
    tag: "",
    disabled: false,
    draggable: false,
    title: "",
    textContent: "",
    width: 0,
    height: 0,
    dataset: {},
    children: [],
    style: {},
    _listeners: {},
    _classes: new Set(),
    _attrs: {},
    _rect: null,
    addEventListener(type, fn) {
      (this._listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      const list = this._listeners[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    setAttribute(name, value) {
      this._attrs[name] = String(value);
    },
    getAttribute(name) {
      return name in this._attrs ? this._attrs[name] : null;
    },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    getBoundingClientRect() {
      if (this._rect) return this._rect;
      return {
        left: 0,
        top: 0,
        width: this.width,
        height: this.height,
        right: this.width,
        bottom: this.height,
      };
    },
    dispatchEvent(event) {
      event.target = this;
      event.currentTarget = this;
      for (const fn of [...(this._listeners[event.type] || [])]) fn(event);
      return true;
    },
    click() {
      if (this.disabled) return;
      for (const fn of this._listeners.click || []) fn();
    },
  };
  el.classList = makeClassList(el);
  Object.defineProperty(el, "className", {
    get() {
      return [...el._classes].join(" ");
    },
    set(value) {
      el._classes = new Set(String(value).split(/\s+/).filter(Boolean));
    },
    enumerable: true,
    configurable: true,
  });
  return el;
}

function makeCanvasContext() {
  const ctx = {
    puts: 0,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    createImageData(w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData() {
      this.puts += 1;
    },
    fillRect() {},
    strokeRect() {},
    clearRect() {},
  };
  return ctx;
}

function installDom() {
  const els = {};
  for (const id of ELEMENT_IDS) els[id] = makeElement(id);
  els.board._ctx = makeCanvasContext();
  els.board.getContext = () => els.board._ctx;
  globalThis.document = {
    getElementById: (id) => els[id] ?? null,
    createElement: (tag) => {
      const el = makeElement();
      el.tag = tag;
      if (tag === "canvas") el.getContext = () => makeCanvasContext();
      return el;
    },
    addEventListener() {},
  };
  return els;
}

function installScheduler() {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const queue = [];
  let nextId = 1;
  globalThis.setTimeout = (fn, ms) => {
    const id = nextId++;
    queue.push({ id, fn, ms });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    const i = queue.findIndex((t) => t.id === id);
    if (i !== -1) queue.splice(i, 1);
  };
  return {
    size: () => queue.length,
    fire() {
      const t = queue.shift();
      assert.ok(t, "expected a scheduled timer to fire");
      t.fn();
    },
    restore() {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    },
  };
}

async function loadUi(tag) {
  installDom();
  const mod = await import(`../src/ui.js?case=${tag}`);
  const sched = installScheduler();
  return { mod, sched };
}

function buttons(els) {
  return {
    start: els["btn-start"],
    stop: els["btn-stop"],
    forward: els["btn-forward"],
    back: els["btn-back"],
    generate: els["btn-generate"],
    clear: els["btn-clear"],
  };
}

function d(id) {
  return globalThis.document.getElementById(id);
}

function genOf() {
  return Number(d("gen-counter").textContent.replace(/\D+/g, ""));
}

function populationOf() {
  return Number(d("population").textContent.replace(/\D+/g, ""));
}

function patternItems() {
  return d("pattern-list").children;
}

function findItem(patternId) {
  const item = patternItems().find((el) => el.dataset.patternId === patternId);
  assert.ok(item, `missing palette item ${patternId}`);
  return item;
}

function makeDragEvent(type, { clientX = 0, clientY = 0 } = {}) {
  const store = {};
  return {
    type,
    clientX,
    clientY,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    dataTransfer: {
      dropEffect: "",
      setData(key, value) {
        store[key] = String(value);
      },
      getData(key) {
        return store[key] ?? "";
      },
    },
  };
}

test("exports: CELL_SIZE=4, colors and tick interval", async () => {
  const { mod, sched } = await loadUi("exports");
  try {
    assert.equal(mod.CELL_SIZE, 4);
    assert.equal(mod.COLOR_ALIVE, "#3ddc84");
    assert.equal(mod.COLOR_DEAD, "#101418");
    assert.equal(mod.TICK_MS, 100);
    assert.equal(mod.CELL_ICON, 6);
  } finally {
    sched.restore();
  }
});

test("init state: canvas 800x400, gen 0, stopped, correct button table", async () => {
  const { sched } = await loadUi("init");
  try {
    const board = d("board");
    assert.equal(board.width, 800);
    assert.equal(board.height, 400);
    assert.match(d("gen-counter").textContent, /0/);
    assert.match(d("run-state").textContent, /остановлено/i);

    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });
    assert.equal(b.start.disabled, false);
    assert.equal(b.stop.disabled, true);
    assert.equal(b.forward.disabled, false);
    assert.equal(b.back.disabled, true, "nothing to step back to at gen 0");
    assert.equal(b.generate.disabled, false);
    assert.equal(b.clear.disabled, false);
    assert.equal(sched.size(), 0, "no timer before start");
  } finally {
    sched.restore();
  }
});

test("start schedules exactly one timer and disables controls; stop clears it", async () => {
  const { sched } = await loadUi("start-stop");
  try {
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });

    b.start.click();
    assert.equal(sched.size(), 1);
    assert.equal(b.start.disabled, true);
    assert.equal(b.stop.disabled, false);
    assert.equal(b.forward.disabled, true);
    assert.equal(b.back.disabled, true);
    assert.equal(b.generate.disabled, true);
    assert.equal(b.clear.disabled, true, "clear disabled while running");
    assert.match(d("run-state").textContent, /идёт эволюция/i);

    // Double start must not create a second timer.
    b.start.click();
    assert.equal(sched.size(), 1, "double start must not schedule a second timer");

    sched.fire(); // tick 1
    assert.match(d("gen-counter").textContent, /1/);
    assert.equal(sched.size(), 1, "tick reschedules itself");

    sched.fire(); // tick 2
    assert.match(d("gen-counter").textContent, /2/);

    b.stop.click();
    assert.equal(sched.size(), 0, "stop clears the pending timer");
    assert.equal(b.start.disabled, false);
    assert.equal(b.stop.disabled, true);
    assert.equal(b.forward.disabled, false);
    assert.equal(b.back.disabled, false, "history preserved across stop");
    assert.equal(b.clear.disabled, false, "clear re-enabled after stop");
    assert.match(d("run-state").textContent, /остановлено/i);
    assert.match(d("gen-counter").textContent, /2/, "stop preserves generation");
  } finally {
    sched.restore();
  }
});

test("step forward/back walks history; back disabled at cursor 0", async () => {
  const { sched } = await loadUi("walk");
  try {
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });

    b.forward.click();
    assert.equal(genOf(), 1);
    assert.equal(b.back.disabled, false, "can step back after forward");
    b.forward.click();
    assert.equal(genOf(), 2);

    b.back.click();
    assert.equal(genOf(), 1);
    b.back.click();
    assert.equal(genOf(), 0);
    assert.equal(b.back.disabled, true, "back disabled at gen 0");

    // redo branch: forward after back must not add new history entries
    b.forward.click();
    assert.equal(genOf(), 1);
    b.forward.click();
    assert.equal(genOf(), 2);
  } finally {
    sched.restore();
  }
});

test("generate resets history to generation 0 and re-enables back only after a step", async () => {
  const { sched } = await loadUi("generate");
  try {
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });

    b.forward.click();
    b.forward.click();
    b.forward.click();
    assert.equal(genOf(), 3);
    assert.equal(b.back.disabled, false);

    b.generate.click();
    assert.equal(genOf(), 0, "generate resets generation counter");
    assert.equal(b.back.disabled, true, "history was reset");
    assert.equal(sched.size(), 0);
  } finally {
    sched.restore();
  }
});

test("generate/forward/back are no-ops while running (buttons disabled)", async () => {
  const { sched } = await loadUi("locked");
  try {
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });

    b.start.click();
    b.forward.click();
    b.back.click();
    b.generate.click();
    b.clear.click();
    assert.equal(genOf(), 0, "no manual step/generate/clear while running");
    assert.equal(sched.size(), 1, "still only the loop timer");
  } finally {
    sched.restore();
  }
});

test("clear empties the field, resets generation and history", async () => {
  const { sched } = await loadUi("clear-click");
  try {
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });

    b.forward.click();
    b.forward.click();
    assert.equal(genOf(), 2);
    assert.equal(b.back.disabled, false);

    b.clear.click();
    assert.equal(genOf(), 0, "clear resets generation counter");
    assert.equal(populationOf(), 0, "clear kills every cell");
    assert.equal(b.back.disabled, true, "clear resets history");
  } finally {
    sched.restore();
  }
});

test("palette renders five draggable pattern items in order", async () => {
  const { sched } = await loadUi("palette");
  try {
    const items = patternItems();
    assert.equal(items.length, 5);
    assert.deepEqual(
      items.map((item) => item.dataset.patternId),
      PATTERN_IDS,
    );
    for (const item of items) {
      assert.ok(item.classList.contains("pattern-item"));
      assert.equal(item.draggable, true);
      assert.equal(item.classList.contains("is-disabled"), false);
      assert.ok(item.getAttribute("aria-label"), `${item.dataset.patternId} aria-label`);
      assert.equal(item.title, item.getAttribute("aria-label"));
    }
  } finally {
    sched.restore();
  }
});

test("palette is locked while running: draggable=false, dragstart has no payload", async () => {
  const { sched } = await loadUi("palette-locked");
  try {
    d("btn-start").click();
    for (const item of patternItems()) {
      assert.equal(item.draggable, false, `${item.dataset.patternId} not draggable`);
      assert.equal(item.classList.contains("is-disabled"), true);
    }

    const item = findItem("glider");
    const dragstart = makeDragEvent("dragstart");
    item.dispatchEvent(dragstart);
    assert.equal(dragstart.dataTransfer.getData("text/plain"), "");
    assert.equal(dragstart.defaultPrevented, true, "dragstart cancelled while running");
  } finally {
    sched.restore();
  }
});

test("dropping a glider stamps it, pushes history without growing gen; back undoes it", async () => {
  const { sched } = await loadUi("drop-glider");
  try {
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });
    const board = d("board");

    b.clear.click();
    assert.equal(populationOf(), 0);

    const dragstart = makeDragEvent("dragstart");
    findItem("glider").dispatchEvent(dragstart);
    assert.equal(dragstart.dataTransfer.getData("text/plain"), "glider");

    board.dispatchEvent(makeDragEvent("drop", { clientX: 402, clientY: 202 }));

    assert.equal(genOf(), 0, "stamping must not grow the generation");
    assert.equal(populationOf(), 5, "glider has five live cells");
    assert.equal(b.back.disabled, false, "stamp pushed a history state");

    b.back.click();
    assert.equal(populationOf(), 0, "back undoes the stamped pattern");
  } finally {
    sched.restore();
  }
});

test("dropping outside the canvas changes nothing", async () => {
  const { sched } = await loadUi("drop-outside");
  try {
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });
    const board = d("board");

    b.clear.click();
    findItem("glider").dispatchEvent(makeDragEvent("dragstart"));

    board.dispatchEvent(makeDragEvent("drop", { clientX: 4000, clientY: 10 }));
    assert.equal(populationOf(), 0, "no cells added");
    assert.equal(b.back.disabled, true, "no history state pushed");
    assert.equal(genOf(), 0);
  } finally {
    sched.restore();
  }
});

test("drop is ignored while running", async () => {
  const { sched } = await loadUi("drop-running");
  try {
    const board = d("board");
    const before = populationOf();
    d("btn-start").click();

    findItem("glider").dispatchEvent(makeDragEvent("dragstart"));
    board.dispatchEvent(makeDragEvent("drop", { clientX: 402, clientY: 202 }));

    assert.equal(populationOf(), before, "running drop must be ignored");
    assert.equal(genOf(), 0);
  } finally {
    sched.restore();
  }
});

test("dragover repaints a preview and dragleave clears it", async () => {
  const { sched } = await loadUi("preview");
  try {
    const board = d("board");
    const ctx = board._ctx;
    d("btn-clear").click();

    findItem("glider").dispatchEvent(makeDragEvent("dragstart"));
    const before = ctx.puts;
    board.dispatchEvent(makeDragEvent("dragover", { clientX: 402, clientY: 202 }));
    assert.ok(ctx.puts > before, "dragover repaints the canvas with a preview");

    const afterOver = ctx.puts;
    board.dispatchEvent(makeDragEvent("dragleave"));
    assert.ok(ctx.puts > afterOver, "dragleave repaints to erase the preview");
  } finally {
    sched.restore();
  }
});

test("pointToCell normalizes against the canvas rect (incl. CSS scale)", async () => {
  const { mod, sched } = await loadUi("point-to-cell");
  try {
    const rect = { left: 0, top: 0, width: 800, height: 400 };
    assert.deepEqual(mod.pointToCell(42, 22, rect, 200, 100), { x: 10, y: 5 });
    assert.deepEqual(mod.pointToCell(0, 0, rect, 200, 100), { x: 0, y: 0 });
    assert.equal(mod.pointToCell(799, 0, rect, 200, 100).x, 199);
    assert.equal(mod.pointToCell(800, 0, rect, 200, 100), null, "right edge excluded");
    assert.equal(mod.pointToCell(0, 400, rect, 200, 100), null, "bottom edge excluded");
    assert.equal(mod.pointToCell(-1, 0, rect, 200, 100), null);
    assert.equal(mod.pointToCell(0, -1, rect, 200, 100), null);
    assert.equal(mod.pointToCell(0, 0, null, 200, 100), null);

    const scaled = { left: 100, top: 50, width: 1600, height: 800 };
    assert.deepEqual(mod.pointToCell(184, 72, scaled, 200, 100), { x: 10, y: 2 });
  } finally {
    sched.restore();
  }
});

test("anchorForPattern centers a pattern under the cursor cell", async () => {
  const { mod, sched } = await loadUi("anchor");
  try {
    assert.deepEqual(mod.anchorForPattern(10, 5, 3, 3), { x: 9, y: 4 });
    assert.deepEqual(mod.anchorForPattern(10, 5, 2, 2), { x: 10, y: 5 });
    assert.deepEqual(mod.anchorForPattern(10, 5, 4, 2), { x: 9, y: 5 });
    assert.deepEqual(mod.anchorForPattern(0, 0, 1, 1), { x: 0, y: 0 });
  } finally {
    sched.restore();
  }
});

test("dragend clears the canvas preview (erases it with a repaint)", async () => {
  const { sched } = await loadUi("dragend");
  try {
    const board = d("board");
    const ctx = board._ctx;
    d("btn-clear").click();

    findItem("glider").dispatchEvent(makeDragEvent("dragstart"));
    board.dispatchEvent(makeDragEvent("dragover", { clientX: 402, clientY: 202 }));
    const afterOver = ctx.puts;

    findItem("glider").dispatchEvent(makeDragEvent("dragend"));
    assert.ok(ctx.puts > afterOver, "dragend repaints to erase the preview");
  } finally {
    sched.restore();
  }
});

test("dropping a pulsar at the far corner clips it to the field (no wrap)", async () => {
  const { sched } = await loadUi("drop-clip");
  try {
    const board = d("board");
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });

    b.clear.click();
    findItem("pulsar").dispatchEvent(makeDragEvent("dragstart"));
    // (799, 399) maps to cell (199, 99); the 13x13 pulsar centered there is
    // clipped to 12 live cells. A toroidal wrap would place all 48.
    board.dispatchEvent(makeDragEvent("drop", { clientX: 799, clientY: 399 }));

    assert.equal(populationOf(), 12, "pulsar must be clipped, not wrapped");
    assert.equal(genOf(), 0, "clipping still does not advance the generation");
    assert.equal(b.back.disabled, false, "a changed field pushes one history state");
  } finally {
    sched.restore();
  }
});

test("several stamps accumulate; each back undoes exactly one stamp", async () => {
  const { sched } = await loadUi("drop-many");
  try {
    const board = d("board");
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });

    b.clear.click();
    findItem("glider").dispatchEvent(makeDragEvent("dragstart"));
    board.dispatchEvent(makeDragEvent("drop", { clientX: 100, clientY: 100 }));
    assert.equal(populationOf(), 5, "glider has five cells");

    findItem("toad").dispatchEvent(makeDragEvent("dragstart"));
    board.dispatchEvent(makeDragEvent("drop", { clientX: 300, clientY: 200 }));
    assert.equal(populationOf(), 11, "glider + toad = eleven cells");
    assert.equal(genOf(), 0);

    b.back.click();
    assert.equal(populationOf(), 5, "back removes only the last stamp");
    b.back.click();
    assert.equal(populationOf(), 0, "back removes the first stamp");
    assert.equal(b.back.disabled, true);
  } finally {
    sched.restore();
  }
});

test("drop resolves the pattern from dataTransfer even after dragend cleared it", async () => {
  const { sched } = await loadUi("drop-datatransfer");
  try {
    const board = d("board");
    d("btn-clear").click();

    findItem("glider").dispatchEvent(makeDragEvent("dragstart"));
    findItem("glider").dispatchEvent(makeDragEvent("dragend")); // clears the module-level dragPattern

    const drop = makeDragEvent("drop", { clientX: 402, clientY: 202 });
    drop.dataTransfer.setData("text/plain", "glider");
    board.dispatchEvent(drop);

    assert.equal(populationOf(), 5, "the id carried by dataTransfer is used");
  } finally {
    sched.restore();
  }
});

test("a no-op stamp (same pattern on the same cells) adds no duplicate history state", async () => {
  const { sched } = await loadUi("drop-noop");
  try {
    const board = d("board");
    const b = buttons({
      "btn-start": d("btn-start"),
      "btn-stop": d("btn-stop"),
      "btn-forward": d("btn-forward"),
      "btn-back": d("btn-back"),
      "btn-generate": d("btn-generate"),
      "btn-clear": d("btn-clear"),
    });

    b.clear.click();
    findItem("glider").dispatchEvent(makeDragEvent("dragstart"));
    board.dispatchEvent(makeDragEvent("drop", { clientX: 402, clientY: 202 }));
    assert.equal(populationOf(), 5);

    // Dropping the same glider on exactly the same cells changes nothing.
    findItem("glider").dispatchEvent(makeDragEvent("dragstart"));
    board.dispatchEvent(makeDragEvent("drop", { clientX: 402, clientY: 202 }));
    assert.equal(populationOf(), 5);

    // Only one history state was created, so a single back clears the field.
    b.back.click();
    assert.equal(populationOf(), 0, "no duplicate history entry for a no-op stamp");
  } finally {
    sched.restore();
  }
});
