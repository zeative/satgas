import { deflateRawSync, inflateRawSync } from "node:zlib";

// The files in a .zip, read from its central directory: stored and deflated entries, no Zip64, no encryption.
// Limits keep a zip bomb from filling memory.
export function readZip(bytes: Uint8Array, limits = { files: 5000, bytes: 50 * 1024 * 1024 }): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  // The end record sits in the last 22 bytes plus up to 64 KB of comment.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("This is not a zip file.");
  const count = u16(end + 10);
  if (count > limits.files) throw new Error(`The zip holds more than ${limits.files} files.`);
  let at = u32(end + 16);
  let total = 0;
  const files = new Map<string, Uint8Array>();
  const names = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || u32(at) !== 0x02014b50) throw new Error("The zip is damaged.");
    const flags = u16(at + 8);
    const method = u16(at + 10);
    const packed = u32(at + 20);
    const size = u32(at + 24);
    const nameLen = u16(at + 28);
    const local = u32(at + 42);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + u16(at + 30) + u16(at + 32);
    if (name.endsWith("/")) continue;
    if (flags & 1) throw new Error("Encrypted zips are not supported.");
    if (packed === 0xffffffff || size === 0xffffffff) throw new Error("Zip64 archives are not supported.");
    total += size;
    if (total > limits.bytes) throw new Error("The zip unpacks to more than 50 MB.");
    if (local + 30 > bytes.length || u32(local) !== 0x04034b50) throw new Error("The zip is damaged.");
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    const data = bytes.subarray(start, start + packed);
    if (method === 0) files.set(name, data.slice());
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(data, { maxOutputLength: size || 1 })));
    else throw new Error(`Unsupported zip compression (method ${method}).`);
  }
  return files;
}

// A zip of the given files, deflated; enough for downloading a skill folder.
export function writeZip(files: Record<string, Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, raw] of Object.entries(files)) {
    const data = new Uint8Array(deflateRawSync(raw));
    const nameBytes = enc.encode(name);
    const crc = Bun.hash.crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    // Bit 11: names are UTF-8.
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 8, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 8, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const count = Object.keys(files).length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, count, true);
  end.setUint16(10, count, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  // A copy, so the bytes own their buffer (Buffer.concat may hand out a slice of a shared pool).
  return new Uint8Array(Buffer.concat([...parts, ...central, new Uint8Array(end.buffer)]));
}
