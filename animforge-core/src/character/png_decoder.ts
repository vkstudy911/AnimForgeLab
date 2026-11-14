import zlib from 'node:zlib';
import fs from 'node:fs';

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array; // RGBA 4 bytes per pixel
  alpha: Uint8Array; // 1 byte per pixel
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crcTarget = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(crcTarget), 8 + len);
  return chunk;
}

/**
 * Pure TypeScript PNG Encoder.
 * Writes standard 8-bit RGBA (colorType 6) PNG format.
 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0 (None)
  const stride = width * 4;
  const scanlines = Buffer.alloc(height * (stride + 1));
  let destPos = 0;
  for (let y = 0; y < height; y++) {
    scanlines[destPos++] = 0; // Filter byte: None
    const srcStart = y * stride;
    const line = Buffer.from(rgba.buffer, rgba.byteOffset + srcStart, stride);
    line.copy(scanlines, destPos);
    destPos += stride;
  }

  const compressed = zlib.deflateSync(scanlines);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Pure TypeScript PNG Decoder using Node built-in zlib.
 * Handles standard 8-bit RGBA (colorType 6) and RGB (colorType 2) PNG images.
 */
export function decodePng(buffer: Buffer): DecodedImage {
  if (buffer.length < 8) {
    throw new Error('Invalid PNG buffer: buffer too short');
  }

  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== pngSig[i]) {
      throw new Error('Invalid PNG signature');
    }
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (width === 0 || height === 0) {
    throw new Error('Invalid PNG: missing or corrupt IHDR chunk');
  }

  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const stride = width * bytesPerPixel;
  const rawRgba = new Uint8Array(width * height * 4);
  const alphaOnly = new Uint8Array(width * height);

  let srcOffset = 0;
  let prevScanline: Uint8Array = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filterType = decompressed[srcOffset++];
    const scanline = new Uint8Array(stride);

    for (let x = 0; x < stride; x++) {
      const rawByte = decompressed[srcOffset++];
      const left = x >= bytesPerPixel ? scanline[x - bytesPerPixel] : 0;
      const up = prevScanline[x];
      const upLeft = x >= bytesPerPixel ? prevScanline[x - bytesPerPixel] : 0;

      let val = rawByte;
      switch (filterType) {
        case 0:
          val = rawByte;
          break;
        case 1:
          val = (rawByte + left) & 0xff;
          break;
        case 2:
          val = (rawByte + up) & 0xff;
          break;
        case 3:
          val = (rawByte + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          let pr = left;
          if (pb < pa && pb < pc) pr = up;
          else if (pc < pa) pr = upLeft;
          val = (rawByte + pr) & 0xff;
          break;
        }
      }
      scanline[x] = val;
    }

    prevScanline = scanline;

    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      const alphaIdx = y * width + x;

      if (colorType === 6) {
        const s = x * 4;
        rawRgba[dstIdx] = scanline[s];
        rawRgba[dstIdx + 1] = scanline[s + 1];
        rawRgba[dstIdx + 2] = scanline[s + 2];
        rawRgba[dstIdx + 3] = scanline[s + 3];
        alphaOnly[alphaIdx] = scanline[s + 3];
      } else if (colorType === 2) {
        const s = x * 3;
        rawRgba[dstIdx] = scanline[s];
        rawRgba[dstIdx + 1] = scanline[s + 1];
        rawRgba[dstIdx + 2] = scanline[s + 2];
        rawRgba[dstIdx + 3] = 255;
        alphaOnly[alphaIdx] = 255;
      } else {
        rawRgba[dstIdx] = scanline[x];
        rawRgba[dstIdx + 1] = scanline[x];
        rawRgba[dstIdx + 2] = scanline[x];
        rawRgba[dstIdx + 3] = 255;
        alphaOnly[alphaIdx] = 255;
      }
    }
  }

  return {
    width,
    height,
    data: rawRgba,
    alpha: alphaOnly,
  };
}

export function readPngFile(filePath: string): DecodedImage {
  const buf = fs.readFileSync(filePath);
  return decodePng(buf);
}

export function writePngFile(filePath: string, width: number, height: number, rgba: Uint8Array): void {
  const encoded = encodePng(width, height, rgba);
  fs.writeFileSync(filePath, encoded);
}
