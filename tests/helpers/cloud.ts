import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import type { TicketClaims } from "../../src/server/cloud/ticket";

// A control plane's key pair, and tickets signed the way docs/cloud-mode.md says the control plane signs them.
export function controlPlaneKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from((publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url").toString("base64");
  return { publicKey, privateKey, raw };
}

export function mintTicket(privateKey: KeyObject, over: Partial<TicketClaims> = {}, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const claims: TicketClaims = {
    v: 1,
    aud: "ws-acme",
    sub: "user_1",
    email: "a@acme.test",
    iat,
    exp: iat + 60,
    jti: crypto.randomUUID(),
    ...over,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `v1.${body}.${sign(null, Buffer.from(`v1.${body}`), privateKey).toString("base64url")}`;
}
