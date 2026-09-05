import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { MemoryTreeQr } from "./MemoryTreeQr";
import { decodeQrImage } from "./decodeQr";
import { packQrMatrix, unpackQrMatrix } from "./qr";
import { loadProjectFromHash, saveProjectToHash, type MemoryProject, type SceneKind, type Season, type TimeOfDay } from "./project";
import { getScenePalette, getTreeSeasonSuggestion } from "./scenePalette";

const defaultProject: MemoryProject = {
  version: 1, payload: "https://example.com/loi-nhan", source: "text", scene: "tree", season: "autumn", time: "night",
  palette: "amber", accent: "#e09a35", title: "Một miền ký ức", message: "Mỗi lần quét là một lần câu chuyện được thắp sáng.",
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
  const [sourceTab, setSourceTab] = useState<"upload" | "text">(project.source === "text" ? "text" : "upload");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareLabel, setShareLabel] = useState("Sao chép link 3D");

  useEffect(() => { try { localStorage.setItem("memory-tree-draft-v1", JSON.stringify(project)); } catch { /* Private browsing may disable storage. */ } }, [project]);
  const statusText = project.source === "vietqr" ? "QR ngân hàng đã lưu" : project.source === "upload" ? "Giữ nguyên từng ô từ ảnh" : "Nội dung tùy chọn";
  const scenePalette = useMemo(() => getScenePalette(project.scene, project.season, project.time, project.accent, project.floorColor), [project.scene, project.season, project.time, project.accent, project.floorColor]);
  const treeSuggestion = getTreeSeasonSuggestion(project.season);

  function update<K extends keyof MemoryProject>(key: K, value: MemoryProject[K]) { setProject((current) => ({ ...current, [key]: value, ...(key === "payload" ? { matrix: undefined, source: "text" as const } : {}) })); }
  function chooseSeason(season: Season) {
    const suggestion = getTreeSeasonSuggestion(season);
    setProject((current) => ({ ...current, season, accent: current.scene === "tree" ? suggestion.accent : current.accent, floorColor: current.scene === "tree" ? current.floorColor : undefined }));
  }

  async function readQr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setNotice("Ảnh lớn hơn 10 MB. Hãy chọn ảnh nhỏ hơn để xử lý nhanh và rõ hơn."); return; }
    setBusy(true); setNotice("Đang đọc mã ngay trên thiết bị…");
    try {
      const { payload, matrix } = await decodeQrImage(file);
      setProject((current) => ({ ...current, payload, matrix: packQrMatrix(matrix), source: "upload" }));
      setNotice(`Đã giữ nguyên lưới ${matrix.size} × ${matrix.size} ô. Ảnh chỉ được xử lý trên thiết bị của bạn.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể đọc mã trong ảnh này."); }
    finally { setBusy(false); event.target.value = ""; }
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
        <button className={sourceTab === "text" ? "active" : ""} onClick={() => setSourceTab("text")}>Link / chữ</button>
      </div>
      {sourceTab === "upload" && <label className="dropzone"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={readQr} disabled={busy}/><span className="upload-icon">↥</span><strong>{busy ? "Đang đọc từng ô…" : "Chọn ảnh mã QR"}</strong><small>Ảnh QR ngân hàng hoặc QR bất kỳ<br/>PNG, JPG, WEBP · tối đa 10 MB</small></label>}
      {sourceTab === "text" && <div className="field-stack"><label>Nội dung cần mã hóa<textarea value={project.payload} onChange={(e) => update("payload", e.target.value)} rows={4}/></label><small className="privacy-note">Không nhập mật khẩu hoặc dữ liệu bí mật.</small></div>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="panel-heading panel-section"><span>02</span><div><strong>Chọn thế giới</strong><small>Ba cách kể cùng một mã</small></div></div>
      <div className="scene-grid">{scenes.map((scene) => <button key={scene.id} className={project.scene === scene.id ? "active" : ""} onClick={() => update("scene", scene.id)}><b>{scene.icon}</b><span><strong>{scene.name}</strong><small>{scene.hint}</small></span></button>)}</div>
      <div className="panel-heading panel-section"><span>03</span><div><strong>Khí sắc</strong><small>Mùa, ánh sáng và màu chủ đạo</small></div></div>
      <div className="customizer">
        <div className="option-group"><span>Mùa</span><div className="segmented">{seasons.map(({id, name}) => <button type="button" key={id} className={project.season === id ? "active" : ""} onClick={() => chooseSeason(id)}>{name}</button>)}</div></div>
        {project.scene === "tree" && <div className="season-suggestion" aria-label={`Bảng màu gợi ý mùa ${project.season}`}>
          <span>Bảng màu đang áp dụng</span>
          <div><b>Cỏ</b><i>{treeSuggestion.nature.grass.map((color) => <em key={color} style={{ background: color }} title={`Màu cỏ ${color}`}/>)}</i></div>
          <div><b>Lá</b><i>{treeSuggestion.nature.leaves.map((color) => <em key={color} style={{ background: color }} title={`Màu lá ${color}`}/>)}</i></div>
          <div className="season-effect"><b>Điểm nhấn</b><i><em style={{ background: treeSuggestion.accent }} title={`Màu điểm nhấn ${treeSuggestion.accent}`}/></i><small>{treeSuggestion.effectLabel}</small></div>
        </div>}
        <div className="option-group"><span>Ánh sáng</span><div className="segmented two"><button type="button" className={project.time === "day" ? "active" : ""} onClick={() => update("time", "day" as TimeOfDay)}>☀ Ban ngày</button><button type="button" className={project.time === "night" ? "active" : ""} onClick={() => update("time", "night" as TimeOfDay)}>◐ Ban đêm</button></div></div>
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

function loadDraft(): MemoryProject | null { try { const value = localStorage.getItem("memory-tree-draft-v1"); if (!value) return null; const project = JSON.parse(value) as MemoryProject; if (project.matrix) unpackQrMatrix(project.matrix); return project; } catch { return null; } }
