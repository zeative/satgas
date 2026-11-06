import { expect, test } from "bun:test";
import { imageCardSize, imageSize } from "../../src/shared/image-size";

const png = (w: number, h: number) => {
  const b = new Uint8Array(24);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x89504e47);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
};

test("a picture's size is read from its header", () => {
  expect(imageSize(png(1280, 2184))).toEqual({ width: 1280, height: 2184 });
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]);
  expect(imageSize(gif)).toEqual({ width: 320, height: 240 });
  // A minimal JPEG: SOI, an APP0 segment, then SOF0 with height 600 and width 800.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03]);
  expect(imageSize(jpeg)).toEqual({ width: 800, height: 600 });
  expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
});

test("the card keeps the picture's proportions and stays within a screen's height", () => {
  expect(imageCardSize({ width: 1280, height: 720 })).toEqual({ w: 320, h: 180 });
  expect(imageCardSize({ width: 1280, height: 2184 })).toEqual({ w: 320, h: 546 });
  expect(imageCardSize({ width: 400, height: 4000 })).toEqual({ w: 90, h: 900 });
  expect(imageCardSize(null)).toBeNull();
});
