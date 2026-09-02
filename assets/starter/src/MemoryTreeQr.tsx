import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import * as THREE from "three";
import { classifyDarkModule, createQrMatrix, type QrMatrix, type QrVisualRole } from "./qr";
import type { MemoryProject, SceneKind, Season } from "./project";

type ViewMode = "showcase" | "scan";
type Props = { project: MemoryProject; onShare: () => void; shareLabel: string };

const seasonColor: Record<Season, string> = { spring: "#e8a6ae", summer: "#6f8f4c", autumn: "#d9943e", winter: "#cdd9d8" };
const sceneNames: Record<SceneKind, string> = { tree: "Cây Kí Ức", lantern: "Vườn Đèn Lồng", koi: "Hồ Koi" };

export function MemoryTreeQr({ project, onShare, shareLabel }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<ViewMode>("showcase");
  const [mode, setModeState] = useState<ViewMode>("showcase");
  const [status, setStatus] = useState("Đang gieo từng ô ký ức…");
  const safePayload = project.payload.trim() || "https://example.com/loi-nhan";

  function setMode(next: ViewMode) { modeRef.current = next; setModeState(next); }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const container = mount;
    let matrix: QrMatrix;
    try { matrix = createQrMatrix(safePayload); }
    catch { setStatus("Nội dung quá dài hoặc không thể tạo QR."); return; }

    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }); }
    catch { setStatus("Thiết bị không hỗ trợ WebGL. Bạn vẫn có thể tải mã PNG."); return; }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "memory-tree-canvas";
    renderer.domElement.setAttribute("aria-label", `Mô hình 3D ${sceneNames[project.scene]}`);
    container.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 300);
    camera.up.set(0, 0, -1);
    const root = new THREE.Group(); scene.add(root);
    const accent = new THREE.Color(project.accent);
    const seasonal = new THREE.Color(seasonColor[project.season]);
    const night = project.time === "night";

    scene.add(new THREE.HemisphereLight(night ? 0x97a6cc : 0xffe8b0, night ? 0x111528 : 0x4a2d1c, night ? 1.45 : 2.35));
    const key = new THREE.DirectionalLight(night ? 0x90a7ef : 0xffd08b, night ? 2 : 3.2); key.position.set(-24, 38, 20); scene.add(key);
    const glow = new THREE.PointLight(new THREE.Color(project.accent), night ? 22 : 10, matrix.size * 1.7); glow.position.set(0, 15, 0); scene.add(glow);

    const plateSize = matrix.size + 8;
    const plateColor = project.scene === "koi" ? (night ? 0x132b35 : 0xc6e0d5) : night ? 0x1b1a1b : 0xf3e8ca;
    const basePlateColor = new THREE.Color(plateColor);
    const scanPlateColor = new THREE.Color("#fffdf4");
    const plate = new THREE.Mesh(new THREE.BoxGeometry(plateSize, 0.5, plateSize), new THREE.MeshBasicMaterial({ color: plateColor }));
    plate.position.y = -0.28; root.add(plate);

    const entries: Array<{ x: number; z: number; role: QrVisualRole }> = [];
    const centre = (matrix.size - 1) / 2;
    matrix.modules.forEach((row, r) => row.forEach((dark, c) => { if (dark) entries.push({ x: c - centre, z: r - centre, role: classifyDarkModule(r, c, matrix.size) }); }));
    const moduleGeometry = new THREE.BoxGeometry(0.9, 0.48, 0.9);
    const moduleMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: project.scene === "koi" ? 0.4 : 0.82, metalness: 0.05 });
    const modules = new THREE.InstancedMesh(moduleGeometry, moduleMaterial, entries.length);
    const showcaseColors = makeShowcaseColors(project.scene, accent, seasonal, night);
    const dummy = new THREE.Object3D();
    entries.forEach((entry, i) => { dummy.position.set(entry.x, 0.18 + (entry.role === "protected" ? 0.04 : 0), entry.z); dummy.updateMatrix(); modules.setMatrixAt(i, dummy.matrix); modules.setColorAt(i, showcaseColors[entry.role]); });
    modules.instanceMatrix.needsUpdate = true; if (modules.instanceColor) modules.instanceColor.needsUpdate = true; root.add(modules);

    const story = buildStoryLayer(project.scene, project.season, project.accent, matrix.size, night); root.add(story);
    const particles = buildParticles(project.scene, project.season, project.accent, matrix.size); root.add(particles);

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scanMix = 0, targetYaw = -0.5, currentYaw = targetYaw, dragging = false, startX = 0, startYaw = targetYaw, last = performance.now();
    let previousMix = -1; const mixed = new THREE.Color(); const scanColor = new THREE.Color("#152018");
    const showcaseCamera = new THREE.Vector3(matrix.size * 0.82, matrix.size * 0.74, matrix.size * 0.92);
    const scanCamera = new THREE.Vector3(0, matrix.size + 32, 0.001); const desired = new THREE.Vector3();

    function down(event: PointerEvent) { if (modeRef.current !== "showcase") return; dragging = true; startX = event.clientX; startYaw = targetYaw; renderer.domElement.setPointerCapture(event.pointerId); }
    function move(event: PointerEvent) { if (dragging && modeRef.current === "showcase") targetYaw = startYaw + (event.clientX - startX) * 0.008; }
    function up(event: PointerEvent) { dragging = false; if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); }
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointercancel", up);

    function resize() {
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight), aspect = width / height, span = matrix.size + 13;
      if (aspect >= 1) { camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2; }
      else { camera.left = -span / 2; camera.right = span / 2; camera.top = span / aspect / 2; camera.bottom = -span / aspect / 2; }
      camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    }
    const observer = new ResizeObserver(resize); observer.observe(container); resize();

    let frame = 0;
    function animate(now: number) {
      const delta = Math.min(0.05, (now - last) / 1000); last = now;
      const target = modeRef.current === "scan" ? 1 : 0; const easing = reducedMotion ? 1 : 1 - Math.exp(-delta * 5.2); scanMix = THREE.MathUtils.lerp(scanMix, target, easing);
      if (!reducedMotion && !dragging && modeRef.current === "showcase") targetYaw += delta * 0.055;
      currentYaw = THREE.MathUtils.lerp(currentYaw, targetYaw, easing); root.rotation.y = currentYaw * (1 - scanMix);
      desired.lerpVectors(showcaseCamera, scanCamera, smoothstep(scanMix)); camera.position.lerp(desired, easing); camera.zoom = THREE.MathUtils.lerp(0.86, 1, smoothstep(scanMix)); camera.updateProjectionMatrix(); camera.lookAt(0, 0, 0);
      story.visible = scanMix < 0.84; particles.visible = scanMix < 0.72; story.scale.setScalar(THREE.MathUtils.lerp(1, 0.76, scanMix));
      if (!reducedMotion) { particles.rotation.y += delta * 0.08; animateStory(story, now, project.scene); }
      if (Math.abs(scanMix - previousMix) > 0.003) { entries.forEach((entry, i) => { mixed.lerpColors(showcaseColors[entry.role], scanColor, scanMix); modules.setColorAt(i, mixed); }); if (modules.instanceColor) modules.instanceColor.needsUpdate = true; previousMix = scanMix; }
      (plate.material as THREE.MeshBasicMaterial).color.lerpColors(basePlateColor, scanPlateColor, smoothstep(scanMix));
      renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    }
    camera.position.copy(showcaseCamera); camera.lookAt(0, 0, 0); setStatus("Chạm và kéo để xoay · chuyển sang Quét mã khi cần"); frame = requestAnimationFrame(animate);

    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("pointercancel", up); scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); const material = mesh.material; if (material) (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose()); }); renderer.dispose(); renderer.domElement.remove(); };
  }, [safePayload, project.scene, project.season, project.time, project.accent]);

  async function downloadQr(hd: boolean) {
    const size = hd ? 3200 : 1600, footer = hd ? 160 : 96, margin = hd ? 180 : 90;
    const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size + footer;
    const context = canvas.getContext("2d"); if (!context) return;
    context.fillStyle = "#fffdf4"; context.fillRect(0, 0, canvas.width, canvas.height);
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, safePayload, { errorCorrectionLevel: "H", margin: 4, width: size - margin * 2, color: { dark: "#152018", light: "#fffdf4" } });
    context.drawImage(qrCanvas, margin, margin, size - margin * 2, size - margin * 2);
    context.fillStyle = "#756b58"; context.textAlign = "center"; context.font = `${hd ? 54 : 30}px Georgia`; context.fillText(hd ? "CÂY KÍ ỨC · SCAN TO REMEMBER" : "CÂY KÍ ỨC · BẢN TIÊU CHUẨN", size / 2, size + footer * 0.58);
    const link = document.createElement("a"); link.download = hd ? "cay-ki-uc-qr-hd.png" : "cay-ki-uc-qr.png"; link.href = canvas.toDataURL("image/png"); link.click();
  }

  return <article className="memory-card" data-time={project.time} data-scene={project.scene}>
    <div className="preview-top"><div><span className="live-dot"/> XEM TRƯỚC TRỰC TIẾP</div><div className="view-switch"><button className={mode === "showcase" ? "active" : ""} onClick={() => setMode("showcase")}>◇ Trưng bày</button><button className={mode === "scan" ? "active" : ""} onClick={() => setMode("scan")}>⌗ Quét mã</button></div></div>
    <div className="memory-stage" data-mode={mode}><div ref={mountRef} className="memory-render"/><div className="world-label"><small>{project.season.toUpperCase()} · {project.time === "night" ? "NIGHT" : "DAY"}</small><strong>{sceneNames[project.scene]}</strong><span>{mode === "scan" ? "Giữ màn hình thẳng và đủ sáng" : status}</span></div><div className="scan-corners" aria-hidden="true"><i/><i/><i/><i/></div></div>
    <div className="preview-info"><div><small>TÁC PHẨM ĐANG GIEO</small><strong>{project.title}</strong><p>{project.message}</p></div><span className="payload-chip">{project.source === "vietqr" ? "VIETQR" : project.source === "upload" ? "QR ẢNH" : "QR TÙY CHỌN"}</span></div>
    <div className="export-row"><button onClick={() => void downloadQr(false)}><span>↓</span><b>Tải PNG</b><small>1600 px · watermark nhỏ</small></button><button onClick={() => void downloadQr(true)}><span>✦</span><b>Tải HD</b><small>3200 px · không watermark</small></button><button onClick={onShare}><span>↗</span><b>{shareLabel}</b><small>Không cần đăng nhập</small></button></div>
    <p className="security-line">⌾ Chế độ “Quét mã” luôn dùng đúng ma trận QR gốc và vùng an toàn bốn ô.</p>
  </article>;
}

function makeShowcaseColors(kind: SceneKind, accent: THREE.Color, seasonal: THREE.Color, night: boolean): Record<QrVisualRole, THREE.Color> {
  const dark = new THREE.Color(night ? "#25372d" : "#31533a");
  if (kind === "lantern") return { protected: dark, canopy: accent.clone(), roots: new THREE.Color("#8b3f2d"), landscape: seasonal.clone().lerp(new THREE.Color("#ae7540"), 0.35) };
  if (kind === "koi") return { protected: dark, canopy: new THREE.Color("#e56c3e"), roots: accent.clone(), landscape: new THREE.Color(night ? "#40766e" : "#79a997") };
  return { protected: dark, canopy: seasonal.clone(), roots: new THREE.Color("#704433"), landscape: accent.clone().lerp(new THREE.Color("#6c8148"), 0.42) };
}

function buildStoryLayer(kind: SceneKind, season: Season, accentHex: string, size: number, night: boolean) {
  const group = new THREE.Group(); group.name = "story";
  if (kind === "tree") buildTree(group, season, accentHex, size);
  if (kind === "lantern") buildLanternGarden(group, season, accentHex, size, night);
  if (kind === "koi") buildKoiPond(group, season, accentHex, size);
  return group;
}

function buildTree(group: THREE.Group, season: Season, accentHex: string, size: number) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x65402f, roughness: 0.95, flatShading: true });
  const leaf = new THREE.MeshStandardMaterial({ color: seasonColor[season], roughness: 0.82, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 0.2, roughness: 0.7 });
  const h = Math.max(6, size * 0.19); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.45, h, 7), wood); trunk.position.y = h / 2 + 0.4; group.add(trunk);
  const crown = [[-5,-2],[-2.7,-3],[0,-2.6],[3,-2],[5,0],[-4,1],[-1.5,1],[1.5,.5],[4,2],[-2.8,3],[0,3.5],[2.8,3.4],[0,5]];
  crown.forEach(([x,z], i) => { const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 + (i%3)*.18, 1), i % 4 === 0 ? accent : leaf); mesh.position.set(x, h + 1.2 + (i%3)*.45, z); mesh.rotation.set(i*.2,i*.45,i*.1); mesh.userData.float = i; group.add(mesh); });
  for (let i=0;i<8;i++) { const lantern = new THREE.Mesh(new THREE.SphereGeometry(.32,10,8), accent); lantern.position.set((i%4-1.5)*2.2, h+1+(i%3), (i%2?1:-1)*2.2); group.add(lantern); }
}

function buildLanternGarden(group: THREE.Group, season: Season, accentHex: string, size: number, night: boolean) {
  const pole = new THREE.MeshStandardMaterial({ color: 0x4b352b, roughness: .9 }); const glow = new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: night ? 1.8 : .55, roughness: .5 });
  const rows = [-1,1]; rows.forEach((side) => { for (let i=-3;i<=3;i++) { const x=i*size*.09, z=side*size*.28; const mast = new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,4.5,6),pole); mast.position.set(x,2.2,z); group.add(mast); const lamp=new THREE.Mesh(new THREE.CylinderGeometry(.58,.46,1.15,12),glow); lamp.position.set(x,4.1+(i%2)*.3,z); lamp.userData.float=i+4; group.add(lamp); } });
  const gate = new THREE.Group(); const posts=[-1,1]; posts.forEach((x)=>{ const p=new THREE.Mesh(new THREE.BoxGeometry(.55,7,.55),pole);p.position.set(x*4,3.5,0);gate.add(p);}); const beam=new THREE.Mesh(new THREE.BoxGeometry(10,.55,.7),pole);beam.position.y=6.6;gate.add(beam);group.add(gate);
  const petals = new THREE.MeshStandardMaterial({ color: seasonColor[season], roughness: .8 }); for(let i=0;i<12;i++){const bloom=new THREE.Mesh(new THREE.SphereGeometry(.3+(i%3)*.08,8,6),petals);bloom.position.set(Math.sin(i*2.1)*size*.34,.35,Math.cos(i*1.7)*size*.34);group.add(bloom);}
}

function buildKoiPond(group: THREE.Group, season: Season, accentHex: string, size: number) {
  const pad = new THREE.MeshStandardMaterial({ color: season === "winter" ? 0x849b8f : 0x587d54, roughness:.65 }); const koiA=new THREE.MeshStandardMaterial({color:0xef6b37,roughness:.55}); const koiB=new THREE.MeshStandardMaterial({color:accentHex,roughness:.55});
  for(let i=0;i<10;i++){const lily=new THREE.Mesh(new THREE.CylinderGeometry(.9+(i%3)*.18,.9+(i%3)*.18,.12,18),pad);lily.position.set(Math.sin(i*1.9)*size*.31,.35,Math.cos(i*1.4)*size*.31);group.add(lily);}
  for(let i=0;i<7;i++){const fish=new THREE.Group();const body=new THREE.Mesh(new THREE.SphereGeometry(.7,12,8),i%2?koiA:koiB);body.scale.set(1.6,.38,.62);fish.add(body);const tail=new THREE.Mesh(new THREE.ConeGeometry(.48,.9,3),i%2?koiA:koiB);tail.rotation.z=Math.PI/2;tail.position.x=-1;fish.add(tail);fish.position.set(Math.sin(i*2.4)*size*.24,.55,Math.cos(i*1.6)*size*.24);fish.rotation.y=i*.9;fish.userData.swim=i;group.add(fish);}
}

function buildParticles(kind: SceneKind, season: Season, color: string, size: number) {
  const count=kind==="koi"?28:44, positions=new Float32Array(count*3); for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*size*.8;positions[i*3+1]=1+Math.random()*12;positions[i*3+2]=(Math.random()-.5)*size*.8;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));const material=new THREE.PointsMaterial({color:season==="winter"?0xffffff:color,size:kind==="koi"?.16:.24,transparent:true,opacity:.68});return new THREE.Points(geometry,material);
}

function animateStory(group: THREE.Group, time: number, kind: SceneKind) { group.children.forEach((child,i)=>{if(child.userData.float!==undefined) child.position.y += Math.sin(time*.0015+i)*.0009;if(kind==="koi"&&child.userData.swim!==undefined) child.rotation.y += .002;}); }
function smoothstep(value: number) { return value * value * (3 - 2 * value); }
