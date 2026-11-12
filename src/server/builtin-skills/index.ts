import guide from "../../../README.md" with { type: "text" };
import type { PackId } from "../../shared/skills";
import { AGENT_SKILLS } from "./agent-skills.gen";
import apps from "./satgas/reference/apps.md" with { type: "text" };
import board from "./satgas/reference/board.md" with { type: "text" };
import branches from "./satgas/reference/branches.md" with { type: "text" };
import documents from "./satgas/reference/documents.md" with { type: "text" };
import reports from "./satgas/reference/reports.md" with { type: "text" };
import rounds from "./satgas/reference/rounds.md" with { type: "text" };
import secrets from "./satgas/reference/secrets.md" with { type: "text" };
import verify from "./satgas/reference/verify.md" with { type: "text" };
import satgas from "./satgas/SKILL.md" with { type: "text" };
import kitData from "./satgas-app/kit/data.tsx.txt" with { type: "text" };
import kitIndex from "./satgas-app/kit/index.ts.txt" with { type: "text" };
import kitLayout from "./satgas-app/kit/layout.tsx.txt" with { type: "text" };
import kitMotion from "./satgas-app/kit/motion.tsx.txt" with { type: "text" };
import kitShell from "./satgas-app/kit/shell.tsx.txt" with { type: "text" };
import kitType from "./satgas-app/kit/type.tsx.txt" with { type: "text" };
import kitUi from "./satgas-app/kit/ui.tsx.txt" with { type: "text" };
import appSkill from "./satgas-app/SKILL.md" with { type: "text" };
import appScaffold from "./satgas-app/scripts/scaffold.mjs.txt" with { type: "text" };
import appUiCheck from "./satgas-app/scripts/ui-check.mjs.txt" with { type: "text" };
import designFonts from "./satgas-design/fonts.md" with { type: "text" };
import designSkill from "./satgas-design/SKILL.md" with { type: "text" };
import designCompare from "./satgas-design/scripts/compare.mjs.txt" with { type: "text" };
import designCutout from "./satgas-design/scripts/cutout.mjs.txt" with { type: "text" };
import designFontsScript from "./satgas-design/scripts/fonts.mjs.txt" with { type: "text" };
import designMeasure from "./satgas-design/scripts/measure.mjs.txt" with { type: "text" };
import designPhotos from "./satgas-design/scripts/photos.mjs.txt" with { type: "text" };
import designRefs from "./satgas-design/scripts/refs.mjs.txt" with { type: "text" };
import { SECURITY_AUDIT } from "./security-audit.gen";

// The README links its neighbours by relative path, which point nowhere inside the skill, so they go to the repository.
export const guideOf = (readme: string) =>
  readme.replace(/\]\((?![a-z]+:|#|\/)([^)\s]+)\)/gi, (_, path: string) => `](https://github.com/zeative/satgas/blob/main/${path})`);

// Skills that ship with Satgas. They can't be removed or replaced, and are written out fresh at every start, so an update
// to Satgas updates them too. Most are always on; the ones in OPTIONAL start on and can be switched off.
export const BUILTIN: Record<string, Record<string, string>> = {
  satgas: {
    "SKILL.md": satgas,
    "reference/board.md": board,
    "reference/verify.md": verify,
    "reference/reports.md": reports,
    "reference/apps.md": apps,
    "reference/documents.md": documents,
    "reference/branches.md": branches,
    "reference/secrets.md": secrets,
    "reference/rounds.md": rounds,
    // The README itself, so the steps agents give about Satgas are the ones its docs give, in any install.
    "reference/satgas-guide.md": guideOf(guide),
  },
  // Satgas's own method for apps: one live frame per page on the canvas, and a starter tagged so the canvas can follow.
  "satgas-app": {
    "SKILL.md": appSkill,
    "scripts/scaffold.mjs": appScaffold,
    "scripts/ui-check.mjs": appUiCheck,
    // The design kit every new app starts from: tokens-only primitives, one shell, one chart, one motion.
    "kit/index.ts": kitIndex,
    "kit/layout.tsx": kitLayout,
    "kit/type.tsx": kitType,
    "kit/ui.tsx": kitUi,
    "kit/data.tsx": kitData,
    "kit/motion.tsx": kitMotion,
    "kit/shell.tsx": kitShell,
  },
  // Satgas's own design method: clone a featured Dribbble shot's design, then check it against the shot in one picture.
  "satgas-design": {
    "SKILL.md": designSkill,
    "fonts.md": designFonts,
    "scripts/fonts.mjs": designFontsScript,
    "scripts/refs.mjs": designRefs,
    "scripts/compare.mjs": designCompare,
    "scripts/cutout.mjs": designCutout,
    "scripts/measure.mjs": designMeasure,
    "scripts/photos.mjs": designPhotos,
  },
  // Addy Osmani's agent-skills (MIT): the engineering workflow every task follows, from spec to ship.
  ...AGENT_SKILLS,
  // Cloudflare's security-audit (MIT): defensive reviews and full audits when a task asks for them.
  ...SECURITY_AUDIT,
};

// Built-in skills the person may switch off, with the repo each came from for the credit on its card.
export const OPTIONAL: Record<string, { repo: string }> = Object.fromEntries([
  ...Object.keys(SECURITY_AUDIT).map((name) => [name, { repo: "cloudflare/security-audit-skill" }]),
]);

// Which bundle a built-in skill belongs to, if any.
export const packOf = (name: string): PackId | undefined => (Object.hasOwn(AGENT_SKILLS, name) ? "agent-skills" : undefined);
