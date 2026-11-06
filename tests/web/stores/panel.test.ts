import { expect, test } from "bun:test";
import { clampPanel, PANEL_MIN } from "../../../src/web/stores/panel";

test("the panel keeps between its minimum and a width that leaves the board room", () => {
  expect(clampPanel(100, 1440)).toBe(PANEL_MIN);
  expect(clampPanel(500.4, 1440)).toBe(500);
  expect(clampPanel(5000, 1440)).toBe(760);
  // On a narrow window the board keeps 360 px beside the panel.
  expect(clampPanel(700, 1000)).toBe(640);
  expect(clampPanel(700, 500)).toBe(PANEL_MIN);
});
