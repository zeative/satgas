import { expect, test } from "bun:test";
import { classifyFailure, isSystemFailure, retryAgent } from "../../src/shared/failures";

const ALIBABA =
  'API Error: 400 event:error data:{"code":"InvalidParameter","message":"Input data may contain inappropriate content. For details, see: https://www.alibabacloud.com/help/en/model-studio/error-code#inappropriate-content"}';

test("reads the kind of failure from what the CLI left", () => {
  const cases: [string, ReturnType<typeof classifyFailure>["kind"]][] = [
    [ALIBABA, "refused"],
    ["Input data may contain inappropriate content.", "refused"],
    ["Your credit balance is too low to access the Anthropic API", "quota"],
    ["API Error: 401 invalid x-api-key", "auth"],
    ["Not logged in · Please run /login", "auth"],
    ["API Error: 429 rate_limit_error", "rate"],
    ["API Error: 529 Overloaded", "rate"],
    ["The model qwen-max-9 does not exist or you do not have access to it.", "model"],
    ["spawn claude ENOENT", "missing"],
    ["stream disconnected before completion: error sending request", "network"],
    ["Request timed out", "timeout"],
    ["Tests failed: 3 of 12", "work"],
    ["Could not find the file src/app.ts", "work"],
  ];
  for (const [error, kind] of cases) expect({ error, kind: classifyFailure(error).kind }).toEqual({ error, kind });
});

test("a refusal moves to the other agent, a glitch stays, the work itself is never retried", () => {
  expect(retryAgent(classifyFailure(ALIBABA), "claude", ["claude", "codex"])).toBe("codex");
  expect(retryAgent(classifyFailure(ALIBABA), "claude", ["claude"])).toBeNull();
  expect(retryAgent(classifyFailure("socket hang up"), "codex", ["claude", "codex"])).toBe("codex");
  expect(retryAgent(classifyFailure("Tests failed"), "claude", ["claude", "codex"])).toBeNull();
  expect(isSystemFailure("work")).toBe(false);
  expect(isSystemFailure("refused")).toBe(true);
});
