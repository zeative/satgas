import { expect, test } from "bun:test";
import { checkMessage, cleanReview, type VisualCheck } from "../../src/server/visual-check";

const check: VisualCheck = {
  lint: "",
  clean: true,
  shots: ["/w/design/shots/check-a/home-390.png"],
  pages: [{ route: "/", name: "Beranda", target: "design/refs/ref-26/part-1.jpg", shots: ["/w/design/shots/check-a/home-390.png"] }],
  hubs: [],
  audit: [{ route: "/", width: 390, findings: ['A greeting as a headline; name the place or the period instead: "Selamat siang!"'] }],
};

// The reviewer's answer is model output: only well-formed pages survive, with scores held to 1–10.
test("a review keeps only well-formed pages and clamps their scores", () => {
  expect(cleanReview(null)).toBeNull();
  expect(cleanReview({ pages: [{ route: 3 }] })).toBeNull();
  expect(
    cleanReview({ pages: [{ route: "/", score: 14.2, template: true, fixes: ["Header: target 34px serif, ours 24px sans", 5] }] }),
  ).toEqual({
    pages: [{ route: "/", score: 10, template: true, fixes: ["Header: target 34px serif, ours 24px sans"] }],
  });
});

test("the builder's next turn carries the reviewer's findings instead of grading itself", () => {
  const review = {
    pages: [{ route: "/", score: 4, template: true, fixes: ["Balance card: target lime #CDF33B block, ours a white card"] }],
  };
  const message = checkMessage(check, "/w", review);
  expect(message).toContain("never saw you build");
  expect(message).toContain("/: 4/10, reads as a template");
  expect(message).toContain("lime #CDF33B");
  expect(message).not.toContain("Score every page");
  expect(message).toContain("/ at 390px");
  // Without a review, the builder looks at its own pictures.
  expect(checkMessage(check, "/w")).toContain("design/shots/check-a/home-390.png");
});
