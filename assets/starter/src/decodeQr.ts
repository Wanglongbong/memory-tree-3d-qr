import jsQR from "jsqr";
import type { QrMatrix } from "./qr";

export async function decodeQrImage(file: File): Promise<{ payload: string; matrix: QrMatrix }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Trình duyệt không thể đọc ảnh này.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return extractQrImage(image.data, width, height);
  } finally { bitmap.close(); }
}

// Extract the photographed modules, including its original mask and error correction.
// Decoding the payload and generating another QR would lose that geometry.
export function extractQrImage(data: Uint8ClampedArray, width: number, height: number) {
  let code = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  if (!code) {
    const normalized = new Uint8ClampedArray(data.length);
    let low = 255, high = 0;
    for (let i = 0; i < data.length; i += 4) { const value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; low = Math.min(low, value); high = Math.max(high, value); }
    for (let i = 0; i < data.length; i += 4) { const value = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] - low) * 255 / Math.max(1, high - low); normalized[i] = normalized[i + 1] = normalized[i + 2] = value; normalized[i + 3] = 255; }
    code = jsQR(normalized, width, height, { inversionAttempts: "attemptBoth" });
  }
  if (!code?.data) throw new Error("Không tìm thấy mã QR rõ ràng. Hãy dùng ảnh đủ sáng và không bị cắt góc.");
  const size = 17 + code.version * 4;
  const loc = code.location;
  const corners = [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner];
  const [a, b, c, d] = corners;
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-8) throw new Error("Góc ảnh quá nghiêng. Hãy chọn ảnh QR nhìn thẳng hơn.");
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
  const samples: number[] = [], spreads: number[] = [];
  for (let r = 0; r < size; r++) for (let col = 0; col < size; col++) {
    let value = 0, minimum = 255, maximum = 0;
    for (const [ox, oy] of [[0, 0], [-0.15, 0], [0.15, 0], [0, -0.15], [0, 0.15]]) {
      const u = (col + 0.5 + ox) / size, v = (r + 0.5 + oy) / size, divisor = g * u + h * v + 1;
      const x = Math.round(((b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v + a.x) / divisor);
      const y = Math.round(((b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v + a.y) / divisor);
      if (x < 0 || y < 0 || x >= width || y >= height) throw new Error("Ảnh bị thiếu mép QR. Hãy chọn ảnh đầy đủ.");
      const i = (y * width + x) * 4;
      const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      value += brightness; minimum = Math.min(minimum, brightness); maximum = Math.max(maximum, brightness);
    }
    samples.push(value / 5);
    spreads.push(maximum - minimum);
  }
  // Two luminance clusters give a threshold based only on the rectified QR area.
  let low = Math.min(...samples), high = Math.max(...samples);
  for (let iteration = 0; iteration < 12; iteration++) {
    const threshold = (low + high) / 2;
    let lowSum = 0, highSum = 0, lowCount = 0, highCount = 0;
    for (const value of samples) { if (value < threshold) { lowSum += value; lowCount++; } else { highSum += value; highCount++; } }
    if (!lowCount || !highCount) break;
    low = lowSum / lowCount; high = highSum / highCount;
  }
  if (spreads.some((spread) => spread > (high - low) * 0.6)) throw new Error("Một số ô QR chưa rõ ranh giới. Hãy dùng ảnh QR gốc hoặc chụp thẳng hơn để giữ đúng từng ô.");
  for (const inverted of [false, true]) {
    const matrix: QrMatrix = { size, modules: Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, col) => (samples[r * size + col] < (low + high) / 2) !== inverted)) };
    const edge = (size + 8) * 5, raster = new Uint8ClampedArray(edge * edge * 4).fill(255);
    matrix.modules.forEach((row, r) => row.forEach((dark, col) => {
      if (!dark) return;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        const i = (((r + 4) * 5 + y) * edge + (col + 4) * 5 + x) * 4;
        raster[i] = raster[i + 1] = raster[i + 2] = 0;
      }
    }));
    const check = jsQR(raster, edge, edge, { inversionAttempts: "dontInvert" });
    if (check?.data === code.data && check.binaryData.length === code.binaryData.length && check.binaryData.every((byte, i) => byte === code.binaryData[i])) return { payload: code.data, matrix };
  }
  throw new Error("Đọc được nội dung nhưng chưa nhận diện rõ từng ô. Hãy chọn ảnh QR gốc hoặc ảnh chụp thẳng, nét hơn.");
}
