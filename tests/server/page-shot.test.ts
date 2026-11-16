import { expect, test } from "bun:test";
import { publicUrl } from "../../src/server/page-shot";

// A site to start from is fetched by the server, so only the public web is reachable through it.
test("addresses inside the machine or its network are refused", async () => {
  for (const raw of [
    "http://127.0.0.1:4318/",
    "http://localhost/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.20.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://intranet/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:pw@example.com/",
  ])
    expect(typeof (await publicUrl(raw))).toBe("string");
});

test("a public address, with or without its scheme, is kept", async () => {
  const a = await publicUrl("93.184.215.14/pricing");
  expect(a instanceof URL && a.href).toBe("https://93.184.215.14/pricing");
  const b = await publicUrl("http://8.8.8.8");
  expect(b instanceof URL && b.protocol).toBe("http:");
});
