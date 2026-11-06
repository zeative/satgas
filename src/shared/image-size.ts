// A picture's pixel size read from the first bytes of its file (PNG, JPEG, GIF, WebP), so a card can take its shape
// before any browser loads it. Unknown or damaged files give null.
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const has = (n: number) => b.length >= n;
  // PNG: the IHDR chunk right after the signature.
  if (has(24) && v.getUint32(0) === 0x89504e47) return { width: v.getUint32(16), height: v.getUint32(20) };
  // GIF: logical screen size, little-endian.
  if (has(10) && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
  // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
  if (has(30) && v.getUint32(0) === 0x52494646 && v.getUint32(8) === 0x57454250) {
    const kind = String.fromCharCode(b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0);
    if (kind === "VP8 ") return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    if (kind === "VP8L") {
      const bits = v.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X")
      return {
        width: 1 + ((b[24] ?? 0) | ((b[25] ?? 0) << 8) | ((b[26] ?? 0) << 16)),
        height: 1 + ((b[27] ?? 0) | ((b[28] ?? 0) << 8) | ((b[29] ?? 0) << 16)),
      };
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (has(4) && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1] ?? 0;
      const len = v.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { width: v.getUint16(i + 7), height: v.getUint16(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

// A card for a picture: the default width, the picture's own proportions, never taller than a screen.
export function imageCardSize(
  size: { width: number; height: number } | null,
  width = 320,
  maxHeight = 900,
): { w: number; h: number } | null {
  if (!size?.width || !size.height) return null;
  const ratio = size.width / size.height;
  const h = Math.round(width / ratio);
  return h <= maxHeight ? { w: width, h: Math.max(40, h) } : { w: Math.max(80, Math.round(maxHeight * ratio)), h: maxHeight };
}
