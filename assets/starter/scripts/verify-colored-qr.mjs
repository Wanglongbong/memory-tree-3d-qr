import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { sourceModule } from "./source-module.mjs";
const { getScenePalette, getTreeSeasonSuggestion } = await sourceModule("src/scenePalette.ts");
const { classifyDarkModule } = await sourceModule("src/qr.ts");

const payload = "https://example.com/ky-uc/colored-round-trip?lang=vi";
const palettes = ["tree", "lantern", "koi"].flatMap(scene => ["spring", "summer", "autumn", "winter"].map(season => ({ name: `${scene}-${season}`, ...getScenePalette(scene, season, "day", getTreeSeasonSuggestion(season).accent) })));

for (const palette of palettes) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "H" });
  const modules = qr.modules.size, margin = 4, cell = 12, size = (modules + margin * 2) * cell;
  const png = new PNG({ width: size, height: size });
  fill(png, hex(palette.floor));
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const color = hex(palette.modules[classifyDarkModule(row, column, modules)]);
      rect(png, (column + margin) * cell, (row + margin) * cell, cell, color);
    }
  }
  const decoded = jsQR(new Uint8ClampedArray(png.data), size, size, { inversionAttempts: "dontInvert" });
  if (decoded?.data !== payload) throw new Error(`${palette.name} palette did not decode`);
  console.log(`Colored QR passed: ${palette.name}`);
}

function fill(png, [r,g,b]) { for (let i = 0; i < png.data.length; i += 4) { png.data[i] = r; png.data[i+1] = g; png.data[i+2] = b; png.data[i+3] = 255; } }
function rect(png, x, y, size, [r, g, b]) { for (let py = y; py < y + size; py += 1) for (let px = x; px < x + size; px += 1) { const index = (py * png.width + px) * 4; png.data[index] = r; png.data[index + 1] = g; png.data[index + 2] = b; png.data[index + 3] = 255; } }
function hex(value) { return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)]; }
