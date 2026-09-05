import assert from "node:assert/strict";
import QRCode from "qrcode";
import { sourceModule } from "./source-module.mjs";
const { extractQrImage } = await sourceModule("src/decodeQr.ts");
const { packQrMatrix, unpackQrMatrix } = await sourceModule("src/qr.ts");
const { saveProjectToHash, loadProjectFromHash } = await sourceModule("src/project.ts");

for (const version of [1, 5, 12, 40]) for (const variant of ["straight", "rotated", "perspective", "inverted"]) {
  const payload = "MEMORY-QR";
  const qr = QRCode.create(payload, { version, errorCorrectionLevel: "M", maskPattern: version % 8 });
  const size = qr.modules.size, edge = (size + 8) * 8;
  const data = new Uint8ClampedArray(edge * edge * 4).fill(255);
  for (let y = 0; y < edge; y++) for (let x = 0; x < edge; x++) {
    let u = x / edge, v = y / edge;
    if (variant === "rotated") [u, v] = [v, 1 - u];
    if (variant === "perspective") { const tilt = version === 1 || version === 40 ? 0.025 : 0.2; v = v / (1 - tilt * v); u = u * (1 + tilt * v) - tilt * 0.6 * v; }
    const r = Math.floor(v * (size + 8)) - 4, c = Math.floor(u * (size + 8)) - 4;
    const dark = r >= 0 && c >= 0 && r < size && c < size && qr.modules.get(r, c);
    const color = (Boolean(dark) !== (variant === "inverted")) ? [66, 86, 43] : [232, 208, 160];
    const i = (y * edge + x) * 4;
    data.set([...color, 255], i);
  }
  const result = extractQrImage(data, edge, edge);
  assert.equal(result.payload, payload);
  const expected = { size, modules: Array.from({length:size}, (_,r) => Array.from({length:size},(_,c)=>Boolean(qr.modules.get(r,c)))) };
  assert.deepEqual(result.matrix, expected, `${version}/${variant}: original cells must match`);
  assert.deepEqual(unpackQrMatrix(packQrMatrix(result.matrix)), expected);
  console.log(`Exact imported cells passed: ${size}×${size} ${variant}`);
}
assert.throws(() => extractQrImage(new Uint8ClampedArray(100 * 100 * 4).fill(255), 100, 100));
assert.throws(() => unpackQrMatrix({size: 177, bits: "AA=="}));
const matrix = { size: 21, modules: Array.from({length:21},()=>Array(21).fill(false)) };
global.window = { location: new URL("https://example.com/") };
global.history = { replaceState: (_state, _title, url) => { window.location = new URL(url); } };
const project = { version:1, payload:"MEMORY-QR", scene:"tree", source:"upload", season:"autumn", time:"day", accent:"#e09a35", title:"Cây", message:"Kí ức", matrix:packQrMatrix(matrix) };
saveProjectToHash(project);
assert.deepEqual(loadProjectFromHash(), project);
delete project.matrix;
saveProjectToHash(project);
assert.deepEqual(loadProjectFromHash(), project);
console.log("Packed matrix, shared link and legacy project passed");
