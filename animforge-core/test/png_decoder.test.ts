import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePng, decodePng } from '../src/character/png_decoder.js';

test('encodePng and decodePng round-trip correctly', () => {
  const width = 16;
  const height = 16;
  const original = new Uint8Array(width * height * 4);

  // Fill test pattern (red circle on transparent background)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - 8;
      const dy = y - 8;
      if (dx * dx + dy * dy <= 25) {
        original[idx] = 255;     // R
        original[idx + 1] = 50;  // G
        original[idx + 2] = 20;  // B
        original[idx + 3] = 255; // A
      }
    }
  }

  const encoded = encodePng(width, height, original);
  assert.ok(encoded.length > 0);
  assert.equal(encoded[0], 0x89);
  assert.equal(encoded[1], 0x50); // 'P'
  assert.equal(encoded[2], 0x4e); // 'N'
  assert.equal(encoded[3], 0x47); // 'G'

  const decoded = decodePng(encoded);
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  assert.deepEqual(decoded.data, original);
  assert.equal(decoded.alpha[8 * width + 8], 255);
  assert.equal(decoded.alpha[0], 0);
});
