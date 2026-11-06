import { expect, test } from "bun:test";
import { BUILTIN, OPTIONAL } from "../../../src/server/builtin-skills";
import { SECURITY_AUDIT, SECURITY_AUDIT_COMMIT } from "../../../src/server/builtin-skills/security-audit.gen";
import { readSkillFile } from "../../../src/shared/skills";

test("Cloudflare's security-audit is vendored whole, pinned to one commit, and switchable", async () => {
  expect(SECURITY_AUDIT_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  const files = SECURITY_AUDIT["security-audit"] ?? {};
  expect(readSkillFile(files["SKILL.md"] ?? "").name).toBe("security-audit");
  // Every reference SKILL.md names, plus the scripts it runs, travel with it.
  for (const f of ["RECONNAISSANCE.md", "HUNTING.md", "VALIDATION-AND-REPORTING.md", "report-schema.json", "validate-findings.cjs"])
    expect(files[f]?.length ?? 0).toBeGreaterThan(100);
  expect(BUILTIN["security-audit"]).toBe(files);
  expect(OPTIONAL["security-audit"]).toEqual({ repo: "cloudflare/security-audit-skill" });
  expect(await Bun.file(new URL("../../../src/server/builtin-skills/security-audit/LICENSE", import.meta.url)).text()).toContain(
    "MIT License",
  );
});
