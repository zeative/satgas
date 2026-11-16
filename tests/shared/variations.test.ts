import { expect, test } from "bun:test";
import { variationsPrompt } from "../../src/web/features/board/variations";

test("variations of a page are new routes beside it, with its device", () => {
  const home = variationsPrompt("web", "Beranda", "/", "desktop", "layout");
  expect(home).toContain("`/home-a`, `/home-b`, `/home-c`");
  expect(home).toContain("leave the original page as it is");
  expect(home).not.toContain('"device"');
  const post = variationsPrompt("web", "Post 1", "/post-1/", "post", "bolder");
  expect(post).toContain("`/post-1-a`");
  expect(post).toContain('"device": "post"');
});
