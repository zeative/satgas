import { expect, test } from "bun:test";
import { Glob } from "bun";

// Links that leave Satgas must carry ref=satgas, which only OutboundLink and openExternal add.
const HOME = "src/web/components/outbound-link.tsx";

test("every link out goes through OutboundLink or openExternal", async () => {
  const strays: string[] = [];
  for await (const path of new Glob("src/web/**/*.{ts,tsx}").scan(".")) {
    if (path === HOME) continue;
    const lines = (await Bun.file(path).text()).split("\n");
    lines.forEach((line, i) => {
      if (/_blank|window\.open\(/.test(line)) strays.push(`${path}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(strays).toEqual([]);
});
