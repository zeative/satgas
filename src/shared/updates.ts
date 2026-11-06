// How Satgas tells people about a new version and moves to it. Shared by server and client.
export type InstallMode = "binary" | "container" | "source";
export type UpdateStage = "idle" | "downloading" | "verifying" | "restarting";
// ok: the latest release is known. none: the repo has no release yet. failed: GitHub did not answer. off: not asked.
export type CheckState = "ok" | "none" | "failed" | "off";

export interface UpdateInfo {
  current: string;
  latest: string | null;
  available: boolean;
  notes: string;
  url: string | null;
  check: CheckState;
  checkedAt: number | null;
  mode: InstallMode;
  // Boards are running, so a restart would cut their agents off.
  busy: boolean;
  stage: UpdateStage;
  // 0 to 1 while downloading; null when the size is unknown.
  progress: number | null;
  error: string | null;
}

// Tells the Docker entry script to start the newest binary again.
export const RESTART_CODE = 75;

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function cleanVersion(tag: unknown): string | null {
  return typeof tag === "string" && VERSION.test(tag.trim()) ? tag.trim().replace(/^v/, "") : null;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = VERSION.exec(candidate);
  const b = VERSION.exec(current);
  if (!a || !b) return false;
  for (const i of [1, 2, 3]) {
    const diff = Number(a[i]) - Number(b[i]);
    if (diff) return diff > 0;
  }
  return false;
}

export function assetName(platform: string, arch: string): string | null {
  if ((platform !== "linux" && platform !== "darwin") || (arch !== "x64" && arch !== "arm64")) return null;
  return `satgas-${platform}-${arch}`;
}

// One line per file, as `sha256sum` prints it.
export function checksumFor(checksums: string, name: string): string | null {
  for (const line of checksums.split("\n")) {
    const [hash, file] = line.trim().split(/\s+\*?/);
    if (file === name && hash && /^[0-9a-f]{64}$/i.test(hash)) return hash.toLowerCase();
  }
  return null;
}
