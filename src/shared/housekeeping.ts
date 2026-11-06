export interface StorageBoard {
  id: string;
  title: string;
  bytes: number;
  // Installed dependencies and build caches an agent can make again.
  cleanable: number;
  live: boolean;
}

export interface StorageReport {
  dataDir: string;
  total: number;
  kinds: { kind: string; bytes: number }[];
  boards: StorageBoard[];
  // Boards working in a folder the person picked: never measured and never cleaned.
  ownFolders: number;
}

export interface SecurityInfo {
  tokenFromEnv: boolean;
  publicUrl: string | null;
  host: string;
  secrets: { runId: string; board: string; id: string; label: string; until: number }[];
}

export interface AboutInfo {
  version: string;
  bun: string;
  platform: string;
  dataDir: string;
  port: number;
  host: string;
  publicUrl: string | null;
  uptimeSec: number;
  boards: number;
  live: number;
  agents: Record<string, string | null> | null;
  programs: Record<string, string | null>;
  repo: string;
}
