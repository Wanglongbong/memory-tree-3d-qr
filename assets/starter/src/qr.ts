import QRCode from "qrcode";

export type QrMatrix = {
  size: number;
  modules: boolean[][];
};

export type QrVisualRole = "protected" | "canopy" | "roots" | "landscape";

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
  const alignmentCentre = size - 7;
  const bottomRightAlignment = Math.abs(row - alignmentCentre) <= 2 && Math.abs(column - alignmentCentre) <= 2;
  return topLeft || topRight || bottomLeft || timing || bottomRightAlignment;
}

export function isNavigableUrl(payload: string) {
  try {
    const url = new URL(payload);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
