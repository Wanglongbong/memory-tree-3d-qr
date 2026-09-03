import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const payload = "https://example.com/ky-uc/colored-round-trip?lang=vi";
const palettes = [
  { name: "tree-spring", floor: "#dfe8b6", colors: ["#214b32", "#3f642f", "#4f5b29", "#5b4c28"] },
  { name: "tree-summer", floor: "#bfd79d", colors: ["#17452f", "#315d2c", "#465b24", "#514826"] },
  { name: "tree-autumn", floor: "#e6cc91", colors: ["#52351f", "#77431f", "#5f3d22", "#765322"] },
  { name: "tree-winter", floor: "#dbe8e6", colors: ["#24433a", "#36584a", "#4e4d37", "#4a5834"] },
  { name: "lantern", floor: "#edc28c", colors: ["#54241f", "#7a2f25", "#66401f", "#815022"] },
  { name: "koi", floor: "#a9d9d5", colors: ["#173d48", "#71352f", "#294c66", "#235d57"] },
];

for (const palette of palettes) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "H" });
  const modules = qr.modules.size, margin = 4, cell = 12, size = (modules + margin * 2) * cell;
  const png = new PNG({ width: size, height: size });
  fill(png, hex(palette.floor));
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const protectedModule = (row <= 8 && column <= 8) || (row <= 8 && column >= modules - 9) || (row >= modules - 9 && column <= 8) || row === 6 || column === 6;
      const color = hex(palette.colors[protectedModule ? 0 : (row * 7 + column * 11) % palette.colors.length]);
      rect(png, (column + margin) * cell, (row + margin) * cell, cell, color);
    }
  }
  const decoded = jsQR(new Uint8ClampedArray(png.data), size, size, { inversionAttempts: "dontInvert" });
  if (decoded?.data !== payload) throw new Error(`${palette.name} palette did not decode`);
  console.log(`Colored QR passed: ${palette.name}`);
}

function fill(png, color) { for (let y = 0; y < png.height; y += 1) rect(png, 0, y, png.width, color); }
function rect(png, x, y, size, [r, g, b]) { for (let py = y; py < y + size; py += 1) for (let px = x; px < x + size; px += 1) { const index = (py * png.width + px) * 4; png.data[index] = r; png.data[index + 1] = g; png.data[index + 2] = b; png.data[index + 3] = 255; } }
function hex(value) { return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)]; }
