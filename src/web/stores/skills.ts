import { create } from "zustand";
import { t } from "@/i18n";
import type { Skill, SkillFind, SkillSource } from "../../shared/skills";

interface SkillsState {
  skills: Skill[] | null;
  error: string | null;
}

export const useSkills = create<SkillsState>(() => ({ skills: null, error: null }));

export async function loadSkills() {
  try {
    const res = await fetch("/api/skills");
    if (!res.ok) throw new Error(String(res.status));
    useSkills.setState({ skills: (await res.json()) as Skill[], error: null });
  } catch {
    useSkills.setState({ error: t.skills.loadFailed });
  }
}

async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 || res.status === 201 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status}).`);
  return data as T;
}

// Every change reads the list back, so the page shows exactly what the server installed.
const thenReload = async <T>(job: Promise<T>) => {
  try {
    return await job;
  } finally {
    void loadSkills();
  }
};

export function setSkillEnabled(name: string, enabled: boolean) {
  const skills = useSkills.getState().skills;
  if (skills) useSkills.setState({ skills: skills.map((s) => (s.name === name ? { ...s, enabled } : s)) });
  return thenReload(call("PATCH", `/api/skills/${encodeURIComponent(name)}`, { enabled }));
}

export const removeSkill = (name: string) => thenReload(call("DELETE", `/api/skills/${encodeURIComponent(name)}`));

export interface OwnSkill {
  name: string;
  description: string;
  body: string;
}

// `previous` edits a skill written before, possibly under a new name.
export const saveSkill = (skill: OwnSkill, previous?: string) =>
  thenReload(previous ? call("PUT", `/api/skills/${encodeURIComponent(previous)}`, skill) : call("POST", "/api/skills", skill));

export const readSkill = (name: string) => call<OwnSkill & { source: SkillSource }>("GET", `/api/skills/${encodeURIComponent(name)}`);

export interface Found {
  stage: string;
  found: SkillFind[];
}

export const findSkills = (from: { github: string } | { local: true }) => call<Found>("POST", "/api/skills/find", from);

export async function findSkillsInArchive(file: File): Promise<Found> {
  const res = await fetch("/api/skills/find-archive", {
    method: "POST",
    headers: { "content-type": file.type || "application/zip", "x-file-name": encodeURIComponent(file.name) },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status}).`);
  return data as Found;
}

export const installSkills = (stage: string, names: string[]) => thenReload(call("POST", "/api/skills/install", { stage, names }));

export interface SkillFileInfo {
  path: string;
  size: number;
}

export const listSkillFiles = (name: string) => call<SkillFileInfo[]>("GET", `/api/skills/${encodeURIComponent(name)}/files`);

// text is absent for a binary file or one too large to show.
export const readSkillFileText = (name: string, path: string) =>
  call<{ path: string; size: number; text?: string }>(
    "GET",
    `/api/skills/${encodeURIComponent(name)}/file?path=${encodeURIComponent(path)}`,
  );

export const skillZipUrl = (name: string) => `/api/skills/${encodeURIComponent(name)}/zip`;
