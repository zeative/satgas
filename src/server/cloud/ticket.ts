// Sign-in tickets from the cloud's control plane. A ticket says "this person may open this instance now": signed with
// the control plane's Ed25519 key, short-lived, for one instance, and good once. The instance only holds the public key,
// so a leaked instance can never mint tickets. Format and rules: docs/cloud-mode.md.
import { createPublicKey, type KeyObject, verify } from "node:crypto";

export interface TicketClaims {
  v: 1;
  // The instance it opens, the person it signs in, and when.
  aud: string;
  sub: string;
  email?: string;
  name?: string;
  iat: number;
  exp: number;
  // Unique per ticket, so a ticket that leaks after use opens nothing.
  jti: string;
}

// A ticket lives seconds, long enough for one redirect; clocks may differ by a little.
export const MAX_LIFETIME_S = 120;
const SKEW_S = 30;

export function publicKeyOf(raw: string): KeyObject {
  const bytes = Buffer.from(raw.trim(), "base64");
  if (bytes.length !== 32) throw new Error("SATGAS_CLOUD_PUBLIC_KEY must be a base64 Ed25519 public key (32 bytes).");
  return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: bytes.toString("base64url") }, format: "jwk" });
}

// Tickets already used, until they would have expired anyway.
const used = new Map<string, number>();

export type TicketResult = { ok: true; claims: TicketClaims } | { ok: false; reason: string };

export function verifyTicket(ticket: string, key: KeyObject, instance: string, now = Date.now()): TicketResult {
  const t = Math.floor(now / 1000);
  for (const [id, exp] of used) if (exp + SKEW_S < t) used.delete(id);
  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const [, body = "", sig = ""] = parts;
  if (!verify(null, Buffer.from(`v1.${body}`), key, Buffer.from(sig, "base64url"))) return { ok: false, reason: "signature" };
  let c: TicketClaims;
  try {
    c = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (c.v !== 1 || typeof c.sub !== "string" || !c.sub || typeof c.jti !== "string" || !c.jti) return { ok: false, reason: "malformed" };
  if (c.aud !== instance) return { ok: false, reason: "audience" };
  if (typeof c.exp !== "number" || typeof c.iat !== "number" || c.exp - c.iat > MAX_LIFETIME_S) return { ok: false, reason: "lifetime" };
  if (c.iat > t + SKEW_S || c.exp + SKEW_S < t) return { ok: false, reason: "expired" };
  if (used.has(c.jti)) return { ok: false, reason: "replayed" };
  used.set(c.jti, c.exp);
  return { ok: true, claims: c };
}

// Only for tests.
export const forgetTickets = () => used.clear();
