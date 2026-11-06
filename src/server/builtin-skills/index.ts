import type { PackId } from "../../shared/skills";
import { AGENT_SKILLS } from "./agent-skills.gen";
import { HALLMARK } from "./hallmark.gen";
import board from "./satgas/reference/board.md" with { type: "text" };
import reports from "./satgas/reference/reports.md" with { type: "text" };
import verify from "./satgas/reference/verify.md" with { type: "text" };
import satgas from "./satgas/SKILL.md" with { type: "text" };
import { SECURITY_AUDIT } from "./security-audit.gen";

// Skills that ship with Satgas. They can't be removed or replaced, and are written out fresh at every start, so an update
// to Satgas updates them too. Most are always on; the ones in OPTIONAL start on and can be switched off.
export const BUILTIN: Record<string, Record<string, string>> = {
  satgas: {
    "SKILL.md": satgas,
    "reference/board.md": board,
    "reference/verify.md": verify,
    "reference/reports.md": reports,
  },
  // Addy Osmani's agent-skills (MIT): the engineering workflow every task follows, from spec to ship.
  ...AGENT_SKILLS,
  // Cloudflare's security-audit (MIT): defensive reviews and full audits when a task asks for them.
  ...SECURITY_AUDIT,
  // Hallmark by Together AI (MIT): the design floor and direction for every interface an agent builds or changes.
  ...HALLMARK,
};

// Built-in skills the person may switch off, with the repo each came from for the credit on its card.
export const OPTIONAL: Record<string, { repo: string }> = Object.fromEntries([
  ...Object.keys(SECURITY_AUDIT).map((name) => [name, { repo: "cloudflare/security-audit-skill" }]),
  ...Object.keys(HALLMARK).map((name) => [name, { repo: "Nutlope/hallmark" }]),
]);

// Which bundle a built-in skill belongs to, if any.
export const packOf = (name: string): PackId | undefined => (Object.hasOwn(AGENT_SKILLS, name) ? "agent-skills" : undefined);
