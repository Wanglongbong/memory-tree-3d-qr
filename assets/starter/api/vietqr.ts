type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = { status(code: number): ApiResponse; json(value: unknown): void; setHeader(name: string, value: string): void };

const VIETQR_URL = "https://api.vietqr.io/v2";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "GET") {
    try {
      const upstream = await fetch(`${VIETQR_URL}/banks`, { headers: { Accept: "application/json" } });
      const result = await upstream.json() as { data?: Array<{ bin: string; shortName?: string; name?: string }> };
      const banks = (result.data ?? []).map((item) => ({ acqId: String(item.bin), name: item.shortName || item.name || String(item.bin) }));
      return response.status(200).json({ banks });
    } catch { return response.status(502).json({ error: "Không tải được danh sách ngân hàng." }); }
  }
  if (request.method !== "POST") return response.status(405).json({ error: "Phương thức không được hỗ trợ." });
  const body = isRecord(request.body) ? request.body : {};
  const accountNo = cleanDigits(body.accountNo);
  const acqId = cleanDigits(body.acqId);
  const amount = cleanDigits(body.amount);
  const accountName = cleanText(body.accountName, 50).toUpperCase();
  const addInfo = cleanText(body.addInfo, 25);
  if (!/^\d{6,19}$/.test(accountNo) || !/^\d{6}$/.test(acqId)) return response.status(400).json({ error: "Thông tin ngân hàng chưa hợp lệ." });
  if (amount && !/^\d{1,13}$/.test(amount)) return response.status(400).json({ error: "Số tiền chưa hợp lệ." });
  const clientId = process.env.VIETQR_CLIENT_ID, apiKey = process.env.VIETQR_API_KEY;
  if (!clientId || !apiKey) return response.status(503).json({ error: "VietQR chưa được kết nối trên máy chủ." });
  try {
    const upstream = await fetch(`${VIETQR_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-id": clientId, "x-api-key": apiKey },
      body: JSON.stringify({ accountNo, accountName: accountName || undefined, acqId: Number(acqId), amount: amount ? Number(amount) : undefined, addInfo: addInfo || undefined, format: "text", template: "qr_only" }),
    });
    const result = await upstream.json() as { code?: string; desc?: string; data?: { qrCode?: string } };
    if (!upstream.ok || result.code !== "00" || !result.data?.qrCode) return response.status(502).json({ error: result.desc || "VietQR không thể tạo mã lúc này." });
    return response.status(200).json({ qrCode: result.data.qrCode });
  } catch { return response.status(502).json({ error: "Không thể kết nối VietQR lúc này." }); }
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object"; }
function cleanDigits(value: unknown) { return typeof value === "string" ? value.replace(/\D/g, "") : ""; }
function cleanText(value: unknown, limit: number) { return typeof value === "string" ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, limit) : ""; }
