// The seam between Satgas and Satgas Cloud's control plane. Every function here does nothing unless SATGAS_CLOUD=1, so a
// self-hosted Satgas behaves exactly as without it.
import type { KeyObject } from "node:crypto";
import { config } from "../config";
import { type CloudEvent, createReporter, fetchQuota, type Reporter } from "./report";
import { publicKeyOf, type TicketClaims, verifyTicket } from "./ticket";

export const CONTRACT_VERSION = 1;
const QUOTA_EVERY_MS = 5 * 60_000;

let key: KeyObject | null = null;
let reporter: Reporter | null = null;

export const isCloud = () => !!config.cloud;

// Fails at start with what is missing: a half-configured instance would let nobody in, or bill nobody.
export function checkCloud(c = config.cloud): string[] {
  if (!c) return [];
  const missing: string[] = [];
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(c.instance)) missing.push("SATGAS_CLOUD_INSTANCE (letters, digits, - or _)");
  if (!/^https:\/\//.test(c.url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(c.url)) missing.push("SATGAS_CLOUD_URL (https)");
  try {
    publicKeyOf(c.publicKey);
  } catch {
    missing.push("SATGAS_CLOUD_PUBLIC_KEY (base64 Ed25519)");
  }
  if (c.secret.length < 32) missing.push("SATGAS_CLOUD_SECRET (32+ characters)");
  return missing;
}

export async function startCloud(): Promise<void> {
  const c = config.cloud;
  if (!c) return;
  const missing = checkCloud(c);
  if (missing.length) throw new Error(`SATGAS_CLOUD=1 needs ${missing.join(", ")}.`);
  key = publicKeyOf(c.publicKey);
  reporter = createReporter({ url: c.url, instance: c.instance, secret: c.secret });
  const poll = async () => {
    const q = await fetchQuota(c.url, c.instance, c.secret);
    if (q) blockedByPoll = q.blocked;
  };
  await poll();
  setInterval(() => void poll(), QUOTA_EVERY_MS).unref?.();
}

let blockedByPoll: string | null = null;

export function cloudReport(e: CloudEvent) {
  reporter?.report(e);
}

// The message shown when the plan says no new work may start, or null.
export function cloudBlocked(): string | null {
  if (!config.cloud) return null;
  return reporter?.quota().blocked ?? blockedByPoll;
}

export function cloudSignIn(ticket: string): { ok: true; claims: TicketClaims } | { ok: false; reason: string } {
  if (!config.cloud || !key) return { ok: false, reason: "off" };
  return verifyTicket(ticket, key, config.cloud.instance);
}

// What the page needs: that it runs in the cloud, and where the person manages their plan.
export const cloudInfo = () => (config.cloud ? { contract: CONTRACT_VERSION, account: `${config.cloud.url}/account` } : null);

export async function stopCloud() {
  await reporter?.flush().catch(() => {});
  reporter?.stop();
}

// Only for tests.
export function useReporter(r: Reporter | null, k: KeyObject | null = key) {
  reporter = r;
  key = k;
}
