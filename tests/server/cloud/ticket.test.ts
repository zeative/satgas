import { beforeEach, expect, test } from "bun:test";
import { forgetTickets, publicKeyOf, verifyTicket } from "../../../src/server/cloud/ticket";
import { controlPlaneKeys, mintTicket } from "../../helpers/cloud";

const keys = controlPlaneKeys();
const key = publicKeyOf(keys.raw);
const now = Date.UTC(2026, 10, 7, 12);

beforeEach(forgetTickets);

test("a ticket the control plane signed for this instance signs the person in, once", () => {
  const ticket = mintTicket(keys.privateKey, {}, now);
  const first = verifyTicket(ticket, key, "ws-acme", now);
  expect(first).toMatchObject({ ok: true, claims: { sub: "user_1", email: "a@acme.test" } });
  expect(verifyTicket(ticket, key, "ws-acme", now + 1000)).toEqual({ ok: false, reason: "replayed" });
});

test("a ticket for another instance, an old one, or one meant to live long opens nothing", () => {
  expect(verifyTicket(mintTicket(keys.privateKey, { aud: "ws-other" }, now), key, "ws-acme", now)).toEqual({
    ok: false,
    reason: "audience",
  });
  expect(verifyTicket(mintTicket(keys.privateKey, {}, now - 10 * 60_000), key, "ws-acme", now)).toEqual({ ok: false, reason: "expired" });
  const t = Math.floor(now / 1000);
  expect(verifyTicket(mintTicket(keys.privateKey, { iat: t, exp: t + 3600 }, now), key, "ws-acme", now)).toEqual({
    ok: false,
    reason: "lifetime",
  });
});

test("a ticket signed by anyone else, changed on the way, or malformed is refused", () => {
  const stranger = controlPlaneKeys();
  expect(verifyTicket(mintTicket(stranger.privateKey, {}, now), key, "ws-acme", now)).toEqual({ ok: false, reason: "signature" });
  const [v, body, sig] = mintTicket(keys.privateKey, {}, now).split(".");
  const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body ?? "", "base64url").toString()), sub: "admin" })).toString(
    "base64url",
  );
  expect(verifyTicket(`${v}.${changed}.${sig}`, key, "ws-acme", now)).toEqual({ ok: false, reason: "signature" });
  expect(verifyTicket("nonsense", key, "ws-acme", now)).toEqual({ ok: false, reason: "malformed" });
});

test("the public key must be a 32-byte Ed25519 key", () => {
  expect(() => publicKeyOf("c2hvcnQ=")).toThrow("SATGAS_CLOUD_PUBLIC_KEY");
});
