import { create } from "zustand";

export interface AuthSupport {
  open: boolean;
  oauth: boolean;
  // Signs in with a code typed on the server's page, because it has no way back to this Satgas.
  device?: boolean;
  failed?: boolean;
}

export type LoginStart = { flow: "redirect"; state: string; open: string } | { flow: "device"; state: string; open: string; code: string };

// Which connectors are signed in, and which need it again.
export const useLogins = create<Record<string, { broken: boolean }>>(() => ({}));

export async function loadLogins() {
  const res = await fetch("/api/connectors/logins").catch(() => null);
  if (res?.ok) useLogins.setState(await res.json(), true);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

export const detectSignIn = (url: string) => post<AuthSupport>("/api/connectors/detect", { url });
export const startSignIn = (serverId: string, url: string) => post<LoginStart>("/api/connectors/login", { serverId, url });

export async function signInStatus(state: string): Promise<{ status: "waiting" | "done" | "failed" | "gone"; error?: string }> {
  const res = await fetch(`/api/connectors/login/${encodeURIComponent(state)}`);
  return res.json();
}
