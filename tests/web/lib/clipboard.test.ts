import "../../helpers/browser";
import { afterEach, expect, test } from "bun:test";
import { Glob } from "bun";

const { copyText } = await import("../../../src/web/lib/clipboard");

const HOME = "src/web/lib/clipboard.ts";
const doc = document as unknown as Record<string, unknown>;
const saved = { create: doc.createElement, exec: doc.execCommand, body: doc.body, active: doc.activeElement };

function fakeDocument(result: boolean) {
  const seen = { selected: "", removed: false, command: "" };
  doc.body = { appendChild() {} };
  doc.activeElement = null;
  doc.createElement = () => ({
    value: "",
    style: {},
    setAttribute() {},
    select() {
      seen.selected = (this as unknown as { value: string }).value;
    },
    remove() {
      seen.removed = true;
    },
  });
  doc.execCommand = (command: string) => {
    seen.command = command;
    return result;
  };
  return seen;
}

afterEach(() => {
  doc.createElement = saved.create;
  doc.execCommand = saved.exec;
  doc.body = saved.body;
  doc.activeElement = saved.active;
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

test("copies on plain http, where the browser has no clipboard API", async () => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  const seen = fakeDocument(true);
  await copyText("hello");
  expect(seen).toEqual({ selected: "hello", removed: true, command: "copy" });
});

test("says so when the browser refuses, so the page can tell the person", async () => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  const seen = fakeDocument(false);
  await expect(copyText("hello")).rejects.toThrow();
  expect(seen.removed).toBe(true);
});

test("uses the clipboard API where it exists", async () => {
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: async (t: string) => {
        written.push(t);
      },
    },
    configurable: true,
  });
  await copyText("hello");
  expect(written).toEqual(["hello"]);
});

// A copy button that calls it directly works on localhost and silently does nothing on plain http.
test("copy buttons go through copyText", async () => {
  const strays: string[] = [];
  for await (const path of new Glob("src/web/**/*.{ts,tsx}").scan(".")) {
    if (path !== HOME && (await Bun.file(path).text()).includes("clipboard.writeText")) strays.push(path);
    if (path !== HOME && /clipboard\?\.writeText/.test(await Bun.file(path).text())) strays.push(path);
  }
  expect(strays).toEqual([]);
});
