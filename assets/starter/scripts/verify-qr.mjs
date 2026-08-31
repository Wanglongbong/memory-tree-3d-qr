import assert from "node:assert/strict";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const payload = "https://example.com/ky-uc/round-trip-check?lang=vi";
const pngBuffer = await QRCode.toBuffer(payload, {
  errorCorrectionLevel: "H",
  margin: 4,
  width: 768,
  color: { dark: "#171d18ff", light: "#fffaf0ff" },
});
const png = PNG.sync.read(pngBuffer);
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

assert(decoded, "Generated QR could not be decoded");
assert.equal(decoded.data, payload, "Decoded payload differs from source payload");
console.log(`QR round trip passed: ${decoded.data}`);
