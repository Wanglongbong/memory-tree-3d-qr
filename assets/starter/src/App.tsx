import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { MemoryTreeQr } from "./MemoryTreeQr";
import { decodeQrImage } from "./decodeQr";
import { loadProjectFromHash, saveProjectToHash, type MemoryProject, type SceneKind, type Season, type TimeOfDay } from "./project";
import { getScenePalette } from "./scenePalette";

const defaultProject: MemoryProject = {
  version: 1, payload: "https://example.com/loi-nhan", source: "text", scene: "tree", season: "autumn", time: "night",
  palette: "amber", accent: "#d99b3d", title: "Một miền ký ức", message: "Mỗi lần quét là một lần câu chuyện được thắp sáng.",
};

const scenes: Array<{ id: SceneKind; name: string; hint: string; icon: string }> = [
  { id: "tree", name: "Cây Kí Ức", hint: "Tán lá đổi theo mùa", icon: "樹" },
  { id: "lantern", name: "Vườn Đèn Lồng", hint: "Ánh sáng của lời chúc", icon: "灯" },
  { id: "koi", name: "Hồ Koi", hint: "Mặt nước giữ bình yên", icon: "鯉" },
];
const seasons: Array<{ id: Season; name: string }> = [
  { id: "spring", name: "Xuân" }, { id: "summer", name: "Hạ" }, { id: "autumn", name: "Thu" }, { id: "winter", name: "Đông" },
];

export function App() {
  const [project, setProject] = useState<MemoryProject>(() => loadProjectFromHash() ?? loadDraft() ?? defaultProject);
  const [sourceTab, setSourceTab] = useState<"upload" | "bank" | "text">(project.source === "vietqr" ? "bank" : project.source === "upload" ? "upload" : "text");
  const [bank, setBank] = useState({ acqId: "970436", bankName: "Vietcombank", accountNo: "", accountName: "", amount: "", addInfo: "" });
  const [bankOptions, setBankOptions] = useState<Array<{ acqId: string; name: string }>>([
    { acqId: "970436", name: "Vietcombank" }, { acqId: "970415", name: "VietinBank" }, { acqId: "970418", name: "BIDV" },
    { acqId: "970405", name: "Agribank" }, { acqId: "970422", name: "MB Bank" }, { acqId: "970407", name: "Techcombank" },
    { acqId: "970416", name: "ACB" }, { acqId: "970432", name: "VPBank" }, { acqId: "970423", name: "TPBank" }, { acqId: "970403", name: "Sacombank" },
  ]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareLabel, setShareLabel] = useState("Sao chép link 3D");

  useEffect(() => { localStorage.setItem("memory-tree-draft-v1", JSON.stringify(project)); }, [project]);
  useEffect(() => {
    fetch("/api/vietqr").then((response) => response.ok ? response.json() : Promise.reject()).then((result: { banks?: Array<{ acqId: string; name: string }> }) => {
      if (result.banks?.length) setBankOptions(result.banks);
    }).catch(() => undefined);
  }, []);
  const statusText = useMemo(() => project.source === "vietqr" ? `VietQR · ${bank.bankName}` : project.source === "upload" ? "QR từ ảnh trên thiết bị" : "Nội dung tùy chọn", [bank.bankName, project.source]);
  const scenePalette = useMemo(() => getScenePalette(project.scene, project.season, project.time, project.accent, project.floorColor), [project.scene, project.season, project.time, project.accent, project.floorColor]);

  function update<K extends keyof MemoryProject>(key: K, value: MemoryProject[K]) { setProject((current) => ({ ...current, [key]: value })); }

  async function readQr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setNotice("Ảnh lớn hơn 10 MB. Hãy chọn ảnh nhỏ hơn để xử lý nhanh và rõ hơn."); return; }
    setBusy(true); setNotice("Đang đọc mã ngay trên thiết bị…");
    try {
      const payload = await decodeQrImage(file);
      setProject((current) => ({ ...current, payload, source: "upload" }));
      setNotice("Đã đọc mã thành công. Ảnh không được tải lên máy chủ.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể đọc mã trong ảnh này."); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function createVietQr(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6,19}$/.test(bank.accountNo)) { setNotice("Số tài khoản cần có từ 6 đến 19 chữ số."); return; }
    setBusy(true); setNotice("Đang tạo VietQR chính xác…");
    try {
      const response = await fetch("/api/vietqr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bank) });
      const result = await response.json() as { qrCode?: string; error?: string };
      if (!response.ok || !result.qrCode) throw new Error(result.error || "VietQR chưa phản hồi.");
      setProject((current) => ({ ...current, payload: result.qrCode!, source: "vietqr" }));
      setNotice("VietQR đã sẵn sàng. Hãy quét thử trước khi chia sẻ.");
    } catch (error) { setNotice(`${error instanceof Error ? error.message : "Không thể tạo VietQR."} Bạn vẫn có thể tải ảnh QR từ ứng dụng ngân hàng ở thẻ bên cạnh.`); }
    finally { setBusy(false); }
  }

  async function shareProject() {
    const url = saveProjectToHash(project);
    try { await navigator.clipboard.writeText(url); setShareLabel("Đã sao chép"); window.setTimeout(() => setShareLabel("Sao chép link 3D"), 1800); }
    catch { window.prompt("Sao chép đường dẫn này", url); }
  }

  return <main className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Cây Kí Ức — trang chủ"><span className="brand-mark">K</span><span>CÂY KÍ ỨC<small>QR DIORAMA STUDIO</small></span></a>
      <div className="header-note"><i /> Mọi ảnh QR được đọc ngay trên máy của bạn</div>
    </header>

    <section className="intro"><div><p className="eyebrow">GIEO MỘT MÃ · GIỮ MỘT CHUYỆN</p><h1>Biến mã QR thành<br/><em>một miền ký ức.</em></h1></div><p>Tạo một tiểu cảnh 3D có thể đổi mùa, đổi sắc và trở về góc nhìn quét an toàn bất cứ lúc nào.</p></section>

    <section className="studio"><aside className="control-panel">
      <div className="panel-heading"><span>01</span><div><strong>Nội dung trong mã</strong><small>{statusText}</small></div></div>
      <div className="source-tabs" role="tablist" aria-label="Nguồn mã QR">
        <button className={sourceTab === "upload" ? "active" : ""} onClick={() => setSourceTab("upload")}>Tải ảnh QR</button>
        <button className={sourceTab === "bank" ? "active" : ""} onClick={() => setSourceTab("bank")}>Tài khoản</button>
        <button className={sourceTab === "text" ? "active" : ""} onClick={() => setSourceTab("text")}>Link / chữ</button>
      </div>
      {sourceTab === "upload" && <label className="dropzone"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={readQr} disabled={busy}/><span className="upload-icon">↥</span><strong>Chọn ảnh mã QR</strong><small>PNG, JPG hoặc WEBP · tối đa 10 MB<br/>Ảnh không rời khỏi thiết bị</small></label>}
      {sourceTab === "text" && <div className="field-stack"><label>Nội dung cần mã hóa<textarea value={project.payload} onChange={(e) => update("payload", e.target.value)} rows={4}/></label><small className="privacy-note">Không nhập mật khẩu hoặc dữ liệu bí mật.</small></div>}
      {sourceTab === "bank" && <form className="bank-form" onSubmit={createVietQr}>
        <div className="two-fields"><label>Ngân hàng<select value={bank.acqId} onChange={(e) => { const option = e.target.selectedOptions[0]; setBank({...bank, acqId: e.target.value, bankName: option.text}); }}>{bankOptions.map((item) => <option key={item.acqId} value={item.acqId}>{item.name}</option>)}</select></label><label>Số tài khoản<input inputMode="numeric" value={bank.accountNo} onChange={(e) => setBank({...bank, accountNo: e.target.value.replace(/\D/g, "")})} placeholder="Chỉ nhập chữ số"/></label></div>
        <label>Tên chủ tài khoản <small>(tùy chọn)</small><input value={bank.accountName} onChange={(e) => setBank({...bank, accountName: e.target.value.toUpperCase()})} placeholder="NGUYEN VAN A"/></label>
        <div className="two-fields"><label>Số tiền <small>(tùy chọn)</small><input inputMode="numeric" value={bank.amount} onChange={(e) => setBank({...bank, amount: e.target.value.replace(/\D/g, "")})} placeholder="VD: 20000"/></label><label>Nội dung <small>(tùy chọn)</small><input value={bank.addInfo} onChange={(e) => setBank({...bank, addInfo: e.target.value})} maxLength={25} placeholder="Coc tra da"/></label></div>
        <button className="primary-action" disabled={busy}>{busy ? "Đang tạo…" : "Tạo VietQR"}</button>
      </form>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="panel-heading panel-section"><span>02</span><div><strong>Chọn thế giới</strong><small>Ba cách kể cùng một mã</small></div></div>
      <div className="scene-grid">{scenes.map((scene) => <button key={scene.id} className={project.scene === scene.id ? "active" : ""} onClick={() => update("scene", scene.id)}><b>{scene.icon}</b><span><strong>{scene.name}</strong><small>{scene.hint}</small></span></button>)}</div>
      <div className="panel-heading panel-section"><span>03</span><div><strong>Khí sắc</strong><small>Mùa, ánh sáng và màu chủ đạo</small></div></div>
      <div className="customizer">
        <label>Mùa<div className="segmented">{seasons.map(({id, name}) => <button key={id} className={project.season === id ? "active" : ""} onClick={() => update("season", id)}>{name}</button>)}</div></label>
        <label>Ánh sáng<div className="segmented two"><button className={project.time === "day" ? "active" : ""} onClick={() => update("time", "day" as TimeOfDay)}>☀ Ban ngày</button><button className={project.time === "night" ? "active" : ""} onClick={() => update("time", "night" as TimeOfDay)}>◐ Ban đêm</button></div></label>
        <label>Màu nhấn<div className="color-row"><input type="color" value={project.accent} onChange={(e) => update("accent", e.target.value)} aria-label="Chọn màu nhấn"/><span>{project.accent.toUpperCase()}</span></div></label>
        <label>Màu sàn <small>(tự giữ độ sáng để quét)</small><div className="color-row"><input type="color" value={scenePalette.floor} onChange={(e) => update("floorColor", e.target.value)} aria-label="Chọn màu sàn"/><span>{scenePalette.floor.toUpperCase()}</span><button type="button" onClick={() => update("floorColor", undefined)}>Theo mùa</button></div></label>
        <div className="palette-preview" aria-label="Bảng màu QR hiện tại"><i style={{background: scenePalette.floor}} title="Màu sàn"/>{Object.values(scenePalette.modules).map((color, index) => <i key={`${color}-${index}`} style={{background: color}} title="Màu module QR"/>)}<span>Sàn + 4 màu QR</span></div>
        <label>Tên tác phẩm<input className="text-control" value={project.title} maxLength={48} onChange={(e) => update("title", e.target.value)} /></label>
        <label>Lời nhắn<textarea className="text-control" value={project.message} rows={2} maxLength={120} onChange={(e) => update("message", e.target.value)} /></label>
      </div>
    </aside><section className="preview-panel"><MemoryTreeQr project={project} onShare={shareProject} shareLabel={shareLabel}/></section></section>
    <footer><span>CÂY KÍ ỨC · 2026</span><p>Mã QR là cấu trúc. Ký ức là điều ta gieo quanh nó.</p></footer>
  </main>;
}

function loadDraft(): MemoryProject | null { try { const value = localStorage.getItem("memory-tree-draft-v1"); return value ? JSON.parse(value) as MemoryProject : null; } catch { return null; } }
