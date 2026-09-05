import QRCode from "qrcode";

export type QrMatrix = {
  size: number;
  modules: boolean[][];
};

export type QrVisualRole = "protected" | "canopy" | "roots" | "landscape";

export type PackedQrMatrix = { size: number; bits: string };

export function packQrMatrix(matrix: QrMatrix): PackedQrMatrix {
  const bytes = new Uint8Array(Math.ceil(matrix.size * matrix.size / 8));
  matrix.modules.flat().forEach((dark, i) => { if (dark) bytes[i >> 3] |= 1 << (7 - i % 8); });
  return { size: matrix.size, bits: btoa(String.fromCharCode(...bytes)) };
}

export function unpackQrMatrix(packed: PackedQrMatrix): QrMatrix {
  const { size, bits } = packed;
  if (!Number.isInteger(size) || size < 21 || size > 177 || (size - 21) % 4 !== 0 || typeof bits !== "string" || bits.length > 5224) throw new Error("Lưới QR không hợp lệ.");
  const bytes = atob(bits);
  if (bytes.length !== Math.ceil(size * size / 8)) throw new Error("Lưới QR bị thiếu ô.");
  return { size, modules: Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => Boolean(bytes.charCodeAt((r * size + c) >> 3) & (1 << (7 - (r * size + c) % 8))))) };
}

export function createQrMatrix(payload: string): QrMatrix {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  return {
    size,
    modules: Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => Boolean(qr.modules.get(row, column))),
    ),
  };
}

export function classifyDarkModule(row: number, column: number, size: number): QrVisualRole {
  if (isProtectedModule(row, column, size)) return "protected";
  const centre = (size - 1) / 2;
  const x = column - centre;
  const z = row - centre;
  if (Math.hypot(x, z) <= size * 0.22) return "canopy";
  if (z > size * 0.14 && Math.abs(x) < size * 0.28) return "roots";
  return "landscape";
}

function isProtectedModule(row: number, column: number, size: number) {
  const topLeft = row <= 8 && column <= 8;
  const topRight = row <= 8 && column >= size - 9;
  const bottomLeft = row >= size - 9 && column <= 8;
  const timing = row === 6 || column === 6;
  const version = (size - 17) / 4;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (count * 2 - 2)) * 2;
  const centres = [6];
  if (version > 1) for (let p = size - 7; centres.length < count; p -= step) centres.splice(1, 0, p);
  const alignment = version > 1 && centres.some((r) => centres.some((c) =>
    !((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) && Math.abs(row - r) <= 2 && Math.abs(column - c) <= 2));
  const metadata = row === 8 || column === 8 || (version >= 7 && ((row < 6 && column >= size - 11) || (column < 6 && row >= size - 11)));
  return topLeft || topRight || bottomLeft || timing || alignment || metadata;
}

export function isNavigableUrl(payload: string) {
  try {
    const url = new URL(payload);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
