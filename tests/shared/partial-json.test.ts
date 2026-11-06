import { expect, test } from "bun:test";
import { parsePartial } from "../../src/shared/partial-json";

test("reads a plan while it is still being written", () => {
  expect(parsePartial('{"title": "Cek re')).toEqual({ title: "Cek re" });
  expect(parsePartial('{"title": "Cek repo", "summ')).toEqual({ title: "Cek repo" });
  expect(parsePartial('{"title": "Cek repo", "summary":')).toEqual({ title: "Cek repo" });
  expect(parsePartial('{"hires": [{"name": "Rizky", "role": "Dev')).toEqual({ hires: [{ name: "Rizky", role: "Dev" }] });
  expect(parsePartial('{"nodes": [{"id": "a", "title": "Read"}, {"id": "b", "tit')).toEqual({
    nodes: [{ id: "a", title: "Read" }, { id: "b" }],
  });
  expect(parsePartial('{"ok": tru')).toEqual({});
  expect(parsePartial('{"reply": "He said \\"hi')).toEqual({ reply: 'He said "hi' });
  expect(parsePartial('{"a": "x\\')).toEqual({ a: "x" });
  expect(parsePartial("")).toBeUndefined();
  expect(parsePartial('{"done": true}')).toEqual({ done: true });
});
