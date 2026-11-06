import { expect, test } from "bun:test";
import { assetName, checksumFor, cleanVersion, isNewer } from "../../src/shared/updates";

test("reads release tags, with or without the v", () => {
  expect(cleanVersion("v1.2.3")).toBe("1.2.3");
  expect(cleanVersion("1.2.3")).toBe("1.2.3");
  for (const bad of ["v1.2", "nightly", "1.2.3-beta.1", "", null, 12]) expect(cleanVersion(bad)).toBeNull();
});

test("compares versions as numbers, not text", () => {
  expect(isNewer("0.10.0", "0.9.9")).toBe(true);
  expect(isNewer("1.0.0", "0.99.99")).toBe(true);
  expect(isNewer("0.1.0", "0.1.0")).toBe(false);
  expect(isNewer("0.1.0", "0.2.0")).toBe(false);
  expect(isNewer("garbage", "0.1.0")).toBe(false);
});

test("names the file for each machine it ships to", () => {
  expect(assetName("linux", "x64")).toBe("satgas-linux-x64");
  expect(assetName("darwin", "arm64")).toBe("satgas-darwin-arm64");
  expect(assetName("win32", "x64")).toBeNull();
  expect(assetName("linux", "ia32")).toBeNull();
});

test("finds a file's hash in sha256sum output, in either of its forms", () => {
  const hash = "a".repeat(64);
  const list = `${"b".repeat(64)}  satgas-linux-x64\n${hash} *satgas-darwin-arm64\n`;
  expect(checksumFor(list, "satgas-darwin-arm64")).toBe(hash);
  expect(checksumFor(list, "satgas-linux-arm64")).toBeNull();
  expect(checksumFor(`short  satgas-linux-x64`, "satgas-linux-x64")).toBeNull();
});
