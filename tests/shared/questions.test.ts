import { describe, expect, test } from "bun:test";
import { answerText, cleanAnswers, cleanQuestions, describeAnswers, type Question } from "../../src/shared/questions";

const platform: Question = {
  header: "Platform",
  question: "Which platform first?",
  multiSelect: true,
  options: [
    { label: "TikTok", description: "Short vertical video" },
    { label: "YouTube", description: "Long-form explainers" },
  ],
};
const niche: Question = { ...platform, header: "Niche", question: "Which niche?", multiSelect: false };

describe("cleanQuestions", () => {
  test("keeps well-formed questions and trims what the card shows", () => {
    const [q] = cleanQuestions([
      {
        header: "  Platform ",
        question: "Which\n platform first?",
        multiSelect: true,
        options: [
          { label: "TikTok", description: "Short" },
          { label: "YouTube", description: "Long" },
        ],
      },
    ]);
    expect(q).toEqual({
      header: "Platform",
      question: "Which platform first?",
      multiSelect: true,
      options: [
        { label: "TikTok", description: "Short" },
        { label: "YouTube", description: "Long" },
      ],
    });
  });

  test("drops catch-all and duplicate options, then questions left with fewer than two", () => {
    const questions = cleanQuestions([
      { header: "A", question: "Pick?", options: [{ label: "One" }, { label: "Other" }, { label: "one" }] },
      { header: "B", question: "Pick again?", options: [{ label: "Yes" }, { label: "No" }, { label: "Lainnya" }] },
      { header: "C", question: "", options: [{ label: "x" }, { label: "y" }] },
    ]);
    expect(questions.map((q) => [q.header, q.options.map((o) => o.label), q.multiSelect])).toEqual([["B", ["Yes", "No"], false]]);
  });

  test("caps the count of questions and options and survives garbage", () => {
    const options = ["a", "b", "c", "d", "e"].map((label) => ({ label, description: "" }));
    const many = Array.from({ length: 6 }, (_, i) => ({ header: `H${i}`, question: `Q${i}?`, options }));
    const out = cleanQuestions(many);
    expect(out).toHaveLength(4);
    expect(out[0]?.options).toHaveLength(4);
    expect(cleanQuestions("nope")).toEqual([]);
    expect(cleanQuestions([null, 3, { options: "x" }])).toEqual([]);
  });
});

describe("cleanAnswers", () => {
  test("keeps only offered options, one for a single choice, and the person's own words", () => {
    expect(
      cleanAnswers(
        [{ picked: ["TikTok", "Instagram", "TikTok", "YouTube"] }, { picked: ["TikTok", "YouTube"], own: "  sains  " }],
        [platform, niche],
      ),
    ).toEqual([{ picked: ["TikTok", "YouTube"] }, { picked: ["TikTok"], own: "sains" }]);
  });

  test("refuses replies that leave a question unanswered or do not match the questions", () => {
    expect(cleanAnswers([{ picked: ["Instagram"] }], [platform])).toBeNull();
    expect(cleanAnswers([{ picked: [], own: "   " }], [platform])).toBeNull();
    expect(cleanAnswers([{ picked: ["TikTok"] }], [platform, niche])).toBeNull();
    expect(cleanAnswers("TikTok", [platform])).toBeNull();
  });
});

test("describes the questions and replies in plain words", () => {
  const asked = { questions: [platform, niche], answers: [{ picked: ["TikTok", "YouTube"] }, { picked: [], own: "science\nfor kids" }] };
  expect(answerText(asked.answers[0])).toBe("TikTok, YouTube");
  expect(describeAnswers(asked)).toBe("- Which platform first?\n  TikTok, YouTube\n- Which niche?\n  science\n  for kids");
  expect(describeAnswers({ questions: [niche] })).toBe("- Which niche?\n  (no answer)");
});
