import jsQR from "jsqr";

export async function decodeQrImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Trình duyệt không thể đọc ảnh này.");
    context.drawImage(bitmap, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const code = jsQR(image.data, width, height, { inversionAttempts: "attemptBoth" });
    if (!code?.data) throw new Error("Không tìm thấy mã QR rõ ràng. Hãy dùng ảnh chụp thẳng, đủ sáng và không bị cắt góc.");
    return code.data;
  } finally { bitmap.close(); }
}
