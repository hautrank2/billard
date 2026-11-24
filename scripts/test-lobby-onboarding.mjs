import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, next) {
    let target;
    if (specifier.startsWith("~/")) target = new URL(`../src/${specifier.slice(2)}`, import.meta.url);
    else if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) target = new URL(specifier, context.parentURL);
    if (target && !/\.[a-z]+$/i.test(target.pathname)) {
      for (const suffix of [".ts", ".tsx"]) {
        const file = new URL(target.href + suffix);
        if (existsSync(file)) return next(file.href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".tsx")) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
    return next(url, context);
  },
});
const { TableCards } = await import("../src/app/_components/lobby/catalog-cards.tsx");
const { hasSeenGameTutorial, completeGameTutorial } = await import("../src/app/billiard/_components/billiard-game/preferences.ts");
const renderTables = (tables) => renderToStaticMarkup(React.createElement(TableCards, { tables, ownId: "me", busy: false, resumable: false, onJoin: () => {} }));

test("empty room list shows an explicit empty state, with no placeholder billiard tables", () => {
  const html = renderTables([]);
  assert.match(html, /Chưa có bàn nào được tạo/);
  assert.doesNotMatch(html, /hall-table-card/);
});
test("only created tables appear, including occupied and password-protected rooms", () => {
  const html = renderTables([
    { id: "room-b", slot: 7, hostId: "other", host: "Người chơi B", rule: "nine", playing: true, locked: false },
    { id: "room-a", slot: 2, hostId: "me", host: "Người chơi A", rule: "eight", playing: false, locked: true },
  ]);
  assert.equal((html.match(/class="hall-table-card"/g) ?? []).length, 2);
  assert.ok(html.indexOf("BÀN 02") < html.indexOf("BÀN 07"));
  assert.match(html, /Có mật khẩu/);
  assert.match(html, /Bàn của bạn/);
  assert.match(html, /Đang thi đấu/);
});
test("tutorial is offered to a new viewer, remembers dismissal, and tolerates blocked storage", (t) => {
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  assert.equal(hasSeenGameTutorial(), false);
  values.set("rollnine-game-tutorial-v1", "seen");
  assert.equal(hasSeenGameTutorial(), true);
  values.clear();
  assert.equal(hasSeenGameTutorial(), false);
  const storage = window.localStorage;
  window.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(hasSeenGameTutorial(), false);
  completeGameTutorial();
  assert.equal(hasSeenGameTutorial(), true);
  window.localStorage = storage;
  completeGameTutorial();
  assert.equal(values.get("rollnine-game-tutorial-v1"), "seen");
});
