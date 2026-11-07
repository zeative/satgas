import { afterEach, expect, test } from "bun:test";
import { checkCloud, cloudBlocked, cloudInfo, cloudReport, cloudSignIn, isCloud, useReporter } from "../../../src/server/cloud";
import { createReporter } from "../../../src/server/cloud/report";
import { publicKeyOf } from "../../../src/server/cloud/ticket";
import { config } from "../../../src/server/config";
import { controlPlaneKeys, mintTicket } from "../../helpers/cloud";

const keys = controlPlaneKeys();
const settings = { instance: "ws-acme", url: "https://cloud.test", publicKey: keys.raw, secret: "s".repeat(32) };
const setCloud = (c: typeof config.cloud) => {
  (config as { cloud: typeof config.cloud }).cloud = c;
};

afterEach(() => {
  setCloud(null);
  useReporter(null, null);
});

test("a self-hosted Satgas sees none of it: no cloud info, no block, no sign-in by ticket, and reports go nowhere", () => {
  expect(isCloud()).toBe(false);
  expect(cloudInfo()).toBeNull();
  expect(cloudBlocked()).toBeNull();
  expect(cloudSignIn(mintTicket(keys.privateKey))).toEqual({ ok: false, reason: "off" });
  expect(() => cloudReport({ type: "round.started", run: "r", round: 0 })).not.toThrow();
  expect(checkCloud(null)).toEqual([]);
});

test("cloud mode says at start what it is missing", () => {
  expect(checkCloud(settings)).toEqual([]);
  expect(checkCloud({ instance: "", url: "http://cloud.test", publicKey: "x", secret: "short" })).toEqual([
    "SATGAS_CLOUD_INSTANCE (letters, digits, - or _)",
    "SATGAS_CLOUD_URL (https)",
    "SATGAS_CLOUD_PUBLIC_KEY (base64 Ed25519)",
    "SATGAS_CLOUD_SECRET (32+ characters)",
  ]);
});

test("in cloud mode a ticket signs in, the page learns where the plan lives, and the plan can block new work", async () => {
  setCloud(settings);
  const reporter = createReporter({
    ...settings,
    every: 60_000,
    fetch: (async () => Response.json({ quota: { blocked: true } })) as unknown as typeof fetch,
  });
  useReporter(reporter, publicKeyOf(keys.raw));
  expect(cloudSignIn(mintTicket(keys.privateKey))).toMatchObject({ ok: true });
  expect(cloudInfo()).toEqual({ contract: 1, account: "https://cloud.test/account" });
  cloudReport({ type: "round.started", run: "r", round: 0 });
  await reporter.flush();
  reporter.stop();
  expect(cloudBlocked()).toBe("Your plan's limit is reached.");
});
