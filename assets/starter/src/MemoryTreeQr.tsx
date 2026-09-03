import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { classifyDarkModule, createQrMatrix, type QrMatrix, type QrVisualRole } from "./qr";
import type { MemoryProject, SceneKind } from "./project";
import { getScenePalette, type ScenePalette } from "./scenePalette";

type ViewMode = "showcase" | "scan";
type Props = { project: MemoryProject; onShare: () => void; shareLabel: string };
type GrowthCell = {
  x: number; z: number; height: number; canopy: number;
  role: QrVisualRole; phase: number; crownScale: number;
};

const sceneNames: Record<SceneKind, string> = { tree: "Cây Kí Ức", lantern: "Vườn Đèn Lồng", koi: "Hồ Koi" };

export function MemoryTreeQr({ project, onShare, shareLabel }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<ViewMode>("showcase");
  const [mode, setModeState] = useState<ViewMode>("showcase");
  const [status, setStatus] = useState("Đang kết tinh vật phẩm từ mã QR…");
  const safePayload = project.payload.trim() || "https://example.com/loi-nhan";
  const palette = getScenePalette(project.scene, project.season, project.time, project.accent);

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
    const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 400);
    const root = new THREE.Group(); scene.add(root);
    const night = project.time === "night";
    scene.add(new THREE.HemisphereLight(night ? 0xa7b9dd : 0xffe9bb, night ? 0x151b24 : 0x59412a, night ? 1.5 : 2.4));
    const key = new THREE.DirectionalLight(night ? 0x9eb6ff : 0xffd18b, night ? 2.2 : 3.3); key.position.set(-24, 38, 24); scene.add(key);
    const glow = new THREE.PointLight(palette.glow, night ? 24 : 10, matrix.size * 1.4); glow.position.set(0, matrix.size * 0.26, 0); scene.add(glow);

    const entries = createGrowthCells(matrix, project.scene);
    const groundMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const groundMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), groundMaterial, entries.length);
    groundMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const crownMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const crownMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), crownMaterial, entries.length);
    crownMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const ornamentMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, flatShading: project.scene !== "koi" });
    const ornamentMesh = new THREE.InstancedMesh(createOrnamentGeometry(project.scene), ornamentMaterial, entries.length);
    ornamentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const moduleColors = Object.fromEntries((Object.keys(palette.modules) as QrVisualRole[]).map((role) => [role, new THREE.Color(palette.modules[role])])) as Record<QrVisualRole, THREE.Color>;
    entries.forEach((entry, index) => { groundMesh.setColorAt(index, moduleColors[entry.role]); crownMesh.setColorAt(index, moduleColors[entry.role]); ornamentMesh.setColorAt(index, moduleColors[entry.role]); });
    if (groundMesh.instanceColor) groundMesh.instanceColor.needsUpdate = true;
    if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
    if (ornamentMesh.instanceColor) ornamentMesh.instanceColor.needsUpdate = true;
    root.add(groundMesh, crownMesh, ornamentMesh);

    const scanFloorMaterial = new THREE.MeshBasicMaterial({ color: palette.floor });
    const scanFloor = new THREE.Mesh(new THREE.BoxGeometry(matrix.size + 8, 0.42, matrix.size + 8), scanFloorMaterial); scanFloor.position.y = -0.28; root.add(scanFloor);
    const organicFloorMaterial = new THREE.MeshStandardMaterial({ color: palette.showcaseFloor, transparent: true, roughness: project.scene === "koi" ? 0.3 : 0.92, metalness: project.scene === "koi" ? 0.08 : 0 });
    const organicFloor = new THREE.Mesh(new THREE.CylinderGeometry((matrix.size + 8) * 0.7, (matrix.size + 8) * 0.73, 0.72, project.scene === "koi" ? 48 : 16), organicFloorMaterial);
    organicFloor.position.y = -0.66; root.add(organicFloor);
    const supportLayer = buildSupportLayer(project.scene, entries, palette, matrix.size); root.add(supportLayer);
    const particles = buildParticles(project.scene, project.season === "winter" ? "#ffffff" : palette.glow, matrix.size); root.add(particles);

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startsInScan = modeRef.current === "scan";
    let targetYaw = startsInScan ? 0 : -0.48, currentYaw = targetYaw;
    let targetElevation = startsInScan ? Math.PI / 2 : project.scene === "tree" ? 0.43 : project.scene === "lantern" ? 0.52 : 0.68, currentElevation = targetElevation;
    let dragging = false, startX = 0, startY = 0, startYaw = 0, startElevation = targetElevation;
    let scanMix = startsInScan ? 1 : 0, previousMix = -1, previousGrowth = -1, previousMode = modeRef.current, last = performance.now();
    const bornAt = last;
    const dummy = new THREE.Object3D(); const cellScale = new THREE.Vector3(); const ornamentScale = new THREE.Vector3();
    const showUp = new THREE.Vector3(0, 1, 0), scanUp = new THREE.Vector3(0, 0, -1), cameraUp = new THREE.Vector3();

    function onPointerDown(event: PointerEvent) {
      if (modeRef.current === "scan") return;
      dragging = true; startX = event.clientX; startY = event.clientY; startYaw = targetYaw; startElevation = targetElevation;
      renderer.domElement.setPointerCapture(event.pointerId);
    }
    function onPointerMove(event: PointerEvent) {
      if (!dragging || modeRef.current === "scan") return;
      targetYaw = startYaw + (event.clientX - startX) * 0.008;
      targetElevation = THREE.MathUtils.clamp(startElevation - (event.clientY - startY) * 0.006, 0.34, 1.47);
    }
    function onPointerUp(event: PointerEvent) { dragging = false; if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); }
    renderer.domElement.addEventListener("pointerdown", onPointerDown); renderer.domElement.addEventListener("pointermove", onPointerMove); renderer.domElement.addEventListener("pointerup", onPointerUp); renderer.domElement.addEventListener("pointercancel", onPointerUp);

    function resize() {
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight), aspect = width / height;
      const span = matrix.size + 13;
      if (aspect >= 1) { camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2; }
      else { camera.left = -span / 2; camera.right = span / 2; camera.top = span / aspect / 2; camera.bottom = -span / aspect / 2; }
      camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    }
    const observer = new ResizeObserver(resize); observer.observe(container); resize();

    function updateGrowth(growthProgress: number) {
      entries.forEach((entry, index) => {
        const local = reducedMotion ? 1 : smootherstep(THREE.MathUtils.clamp(growthProgress * 1.22 - entry.phase * 0.22, 0, 1));
        const groundWidth = 0.9 * local;
        cellScale.set(Math.max(0.001, groundWidth), Math.max(0.001, 0.16 * local), Math.max(0.001, groundWidth));
        dummy.position.set(entry.x, 0.08 * local, entry.z); dummy.rotation.set(0, 0, 0); dummy.scale.copy(cellScale); dummy.updateMatrix(); groundMesh.setMatrixAt(index, dummy.matrix);

        const crownY = THREE.MathUtils.lerp(0.2, entry.height, local);
        const crownWidth = 0.88 * local * entry.canopy;
        cellScale.set(Math.max(0.001, crownWidth), Math.max(0.001, 0.2 * local), Math.max(0.001, crownWidth));
        dummy.position.set(entry.x, crownY, entry.z); dummy.rotation.set(0, 0, 0); dummy.scale.copy(cellScale); dummy.updateMatrix(); crownMesh.setMatrixAt(index, dummy.matrix);

        const ornamentSize = entry.crownScale * local * entry.canopy;
        ornamentScale.setScalar(Math.max(0.0001, ornamentSize));
        if (project.scene === "lantern") ornamentScale.set(ornamentSize * 0.72, ornamentSize * 1.08, ornamentSize * 0.72);
        if (project.scene === "koi") ornamentScale.set(ornamentSize * 1.3, ornamentSize * 0.24, ornamentSize);
        dummy.position.set(entry.x, crownY - 0.12, entry.z); dummy.rotation.set(0, entry.phase * Math.PI * 2, 0); dummy.scale.copy(ornamentScale); dummy.updateMatrix(); ornamentMesh.setMatrixAt(index, dummy.matrix);
      });
      groundMesh.instanceMatrix.needsUpdate = true; crownMesh.instanceMatrix.needsUpdate = true; ornamentMesh.instanceMatrix.needsUpdate = true;
    }

    function updateViewLayers(mix: number) {
      organicFloorMaterial.opacity = 1 - smootherstep(THREE.MathUtils.clamp((mix - 0.45) / 0.45, 0, 1)); organicFloor.visible = organicFloorMaterial.opacity > 0.01;
      setLayerOpacity(supportLayer, 1 - smootherstep(THREE.MathUtils.clamp((mix - 0.25) / 0.54, 0, 1)));
      particles.visible = mix < 0.62; particles.scale.setScalar(Math.max(0.001, 1 - mix));
    }

    updateGrowth(startsInScan ? 1 : 0);
    updateViewLayers(scanMix);
    let frame = 0;
    function animate(now: number) {
      const delta = Math.min(0.05, (now - last) / 1000); last = now;
      const activeMode = modeRef.current;
      if (activeMode !== previousMode) {
        if (activeMode === "scan") { targetElevation = Math.PI / 2; targetYaw = 0; }
        else { targetElevation = project.scene === "tree" ? 0.43 : project.scene === "lantern" ? 0.52 : 0.68; targetYaw = -0.48; }
        previousMode = activeMode;
      }
      const easing = reducedMotion ? 1 : 1 - Math.exp(-delta * 5.5);
      currentElevation = THREE.MathUtils.lerp(currentElevation, targetElevation, easing); currentYaw = THREE.MathUtils.lerp(currentYaw, targetYaw, easing);
      const elevationMix = THREE.MathUtils.clamp((currentElevation - 0.72) / 0.78, 0, 0.94);
      const desiredMix = activeMode === "scan" ? 1 : elevationMix;
      scanMix = THREE.MathUtils.lerp(scanMix, desiredMix, easing);
      const growthProgress = activeMode === "scan" ? 1 : THREE.MathUtils.clamp((now - bornAt) / 1900, 0, 1);
      if (Math.abs(growthProgress - previousGrowth) > 0.001) { updateGrowth(growthProgress); previousGrowth = growthProgress; }
      if (Math.abs(scanMix - previousMix) > 0.001) { updateViewLayers(scanMix); previousMix = scanMix; }
      if (!reducedMotion && !dragging && activeMode === "showcase" && scanMix < 0.12) targetYaw += delta * 0.045;
      root.rotation.y = currentYaw * (1 - smootherstep(scanMix));
      const distance = matrix.size * 1.72; const lookHeight = THREE.MathUtils.lerp(project.scene === "tree" ? matrix.size * 0.14 : project.scene === "lantern" ? matrix.size * 0.1 : 0, 0, smootherstep(scanMix));
      camera.position.set(0, lookHeight + Math.sin(currentElevation) * distance, Math.max(0.001, Math.cos(currentElevation) * distance));
      cameraUp.lerpVectors(showUp, scanUp, smootherstep(scanMix)).normalize(); camera.up.copy(cameraUp);
      camera.zoom = THREE.MathUtils.lerp(project.scene === "tree" ? 1.06 : project.scene === "lantern" ? 1.1 : 1.04, 1, smootherstep(scanMix)); camera.updateProjectionMatrix(); camera.lookAt(0, lookHeight, 0);
      if (!reducedMotion) { particles.rotation.y += delta * 0.07; animateSupportLayer(supportLayer, now, project.scene); }
      renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    }
    setStatus("Kéo để quan sát các ô QR sinh trưởng thành cỏ và tán lá"); frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown); renderer.domElement.removeEventListener("pointermove", onPointerMove); renderer.domElement.removeEventListener("pointerup", onPointerUp); renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      const materials = new Set<THREE.Material>(); const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); const material = mesh.material; if (material) (Array.isArray(material) ? material : [material]).forEach((item) => materials.add(item)); });
      geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [safePayload, project.scene, project.season, project.time, project.accent]);

  async function downloadQr(hd: boolean) {
    const matrix = createQrMatrix(safePayload); const size = hd ? 3200 : 1600, footer = hd ? 160 : 96, cells = matrix.size + 8;
    const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size + footer;
    const context = canvas.getContext("2d"); if (!context) return;
    context.fillStyle = palette.floor; context.fillRect(0, 0, canvas.width, canvas.height);
    const cell = Math.floor((size * 0.88) / cells), qrSize = cell * cells, start = Math.floor((size - qrSize) / 2);
    matrix.modules.forEach((row, r) => row.forEach((dark, c) => { if (!dark) return; context.fillStyle = palette.modules[classifyDarkModule(r, c, matrix.size)]; context.fillRect(start + (c + 4) * cell, start + (r + 4) * cell, cell, cell); }));
    context.fillStyle = palette.modules.protected; context.textAlign = "center"; context.font = `${hd ? 54 : 30}px Georgia`; context.fillText(hd ? "CÂY KÍ ỨC · QR ĐA SẮC" : "CÂY KÍ ỨC · BẢN TIÊU CHUẨN", size / 2, size + footer * 0.58);
    const link = document.createElement("a"); link.download = hd ? "cay-ki-uc-qr-hd.png" : "cay-ki-uc-qr.png"; link.href = canvas.toDataURL("image/png"); link.click();
  }

  return <article className="memory-card" data-time={project.time} data-scene={project.scene}>
    <div className="preview-top"><div><span className="live-dot"/> XEM TRƯỚC TRỰC TIẾP</div><div className="view-switch"><button className={mode === "showcase" ? "active" : ""} onClick={() => setMode("showcase")}>◇ Vật phẩm 3D</button><button className={mode === "scan" ? "active" : ""} onClick={() => setMode("scan")}>⌗ Quét mã</button></div></div>
    <div className="memory-stage" data-mode={mode} style={{ "--scan-floor": palette.floor } as CSSProperties}><div ref={mountRef} className="memory-render"/><div className="world-label"><small>{project.season.toUpperCase()} · {project.time === "night" ? "NIGHT" : "DAY"}</small><strong>{sceneNames[project.scene]}</strong><span>{mode === "scan" ? "Cỏ và đỉnh lá thật đang tạo thành mã QR" : status}</span></div><div className="scan-corners" aria-hidden="true"><i/><i/><i/><i/></div></div>
    <div className="preview-info"><div><small>TÁC PHẨM ĐANG GIEO</small><strong>{project.title}</strong><p>{project.message}</p></div><span className="payload-chip">{project.source === "vietqr" ? "VIETQR" : project.source === "upload" ? "QR ẢNH" : "QR TÙY CHỌN"}</span></div>
    <div className="export-row"><button onClick={() => void downloadQr(false)}><span>↓</span><b>Tải PNG</b><small>1600 px · QR đa sắc</small></button><button onClick={() => void downloadQr(true)}><span>✦</span><b>Tải HD</b><small>3200 px · không watermark</small></button><button onClick={onShare}><span>↗</span><b>{shareLabel}</b><small>Không cần đăng nhập</small></button></div>
    <p className="security-line">⌾ Mỗi ô tối gieo một ô cỏ; tán lá mọc đúng trên cùng tọa độ và không lấn sang ô sáng.</p>
  </article>;
}

function createGrowthCells(matrix: QrMatrix, scene: SceneKind): GrowthCell[] {
  const entries: GrowthCell[] = []; const centre = (matrix.size - 1) / 2;
  matrix.modules.forEach((row, r) => row.forEach((dark, c) => {
    if (!dark) return;
    const x = c - centre, z = r - centre, role = classifyDarkModule(r, c, matrix.size), seed = hash2(r, c), phase = seed;
    const radius = Math.hypot(x, z) / (matrix.size * 0.72);
    const dome = Math.sqrt(Math.max(0, 1 - Math.min(1, radius) ** 2));
    const canopy = scene === "tree" ? smootherstep((dome - 0.36) / 0.5) : 1;
    const height = scene === "tree" ? 0.2 + matrix.size * Math.pow(canopy, 1.45) * 0.42 + seed * 0.38 * canopy : scene === "lantern" ? 0.38 + matrix.size * (0.025 + dome * 0.1) + (seed - 0.5) * 0.48 : 0.38 + seed * 0.3;
    entries.push({ x, z, height, canopy, role, phase, crownScale: scene === "tree" ? 0.27 + dome * 0.14 + seed * 0.045 : scene === "lantern" ? 0.42 + seed * 0.08 : 0.38 + seed * 0.08 });
  }));
  return entries;
}

function createOrnamentGeometry(scene: SceneKind) {
  if (scene === "tree") return new THREE.IcosahedronGeometry(0.82, 0);
  if (scene === "lantern") return new THREE.CylinderGeometry(0.58, 0.48, 1.05, 8);
  return new THREE.CylinderGeometry(0.72, 0.72, 0.16, 16);
}

function buildSupportLayer(scene: SceneKind, entries: GrowthCell[], palette: ScenePalette, size: number) {
  const group = new THREE.Group(); group.name = "support-layer";
  const main = new THREE.MeshStandardMaterial({ color: palette.trunk, roughness: 0.9, transparent: true });
  const accent = new THREE.MeshStandardMaterial({ color: palette.glow, emissive: palette.glow, emissiveIntensity: scene === "lantern" ? 0.8 : 0.12, roughness: 0.72, transparent: true });
  if (scene === "tree") {
    const height = size * 0.28; const trunk = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.022, size * 0.045, height, 8), main); trunk.position.y = height / 2; group.add(trunk);
    const stride = Math.max(1, Math.floor(entries.length / 24));
    entries.filter((entry, index) => index % stride === 0 && entry.height > height * 0.75).slice(0, 24).forEach((entry) => addCylinderBetween(group, main, new THREE.Vector3(0, height * 0.64, 0), new THREE.Vector3(entry.x, entry.height - 0.28, entry.z), size * 0.006));
    for (let i = 0; i < 9; i += 1) { const light = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), accent); light.position.set(Math.sin(i * 2.1) * size * 0.09, height + (i % 3) * 1.2, Math.cos(i * 1.7) * size * 0.08); light.userData.float = i; group.add(light); }
  } else if (scene === "lantern") {
    for (let i = -4; i <= 4; i += 1) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, size * 0.18, 6), main); pole.position.set(i * size * 0.035, size * 0.09, (i % 2) * size * 0.07); group.add(pole); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(size * 0.42, 0.42, 0.58), main); beam.position.y = size * 0.19; group.add(beam);
  } else {
    for (let i = 0; i < 7; i += 1) { const fish = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 7), i % 2 ? accent : main); body.scale.set(1.7, 0.4, 0.65); fish.add(body); const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.75, 3), i % 2 ? accent : main); tail.rotation.z = Math.PI / 2; tail.position.x = -0.9; fish.add(tail); fish.position.set(Math.sin(i * 2.2) * size * 0.18, 0.1, Math.cos(i * 1.55) * size * 0.18); fish.rotation.y = i * 0.8; fish.userData.swim = i; group.add(fish); }
  }
  return group;
}

function buildParticles(scene: SceneKind, color: string, size: number) {
  const count = scene === "koi" ? 24 : 42, positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) { positions[i * 3] = (hash2(i, 2) - 0.5) * size * 0.65; positions[i * 3 + 1] = 1 + hash2(i, 5) * size * 0.38; positions[i * 3 + 2] = (hash2(i, 8) - 0.5) * size * 0.65; }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: scene === "koi" ? 0.14 : 0.23, transparent: true, opacity: 0.7 }));
}

function setLayerOpacity(group: THREE.Group, opacity: number) {
  group.visible = opacity > 0.01;
  group.traverse((object) => { const mesh = object as THREE.Mesh; const material = mesh.material; if (!material) return; (Array.isArray(material) ? material : [material]).forEach((item) => { item.transparent = true; item.opacity = opacity; item.depthWrite = opacity > 0.5; }); });
}

function animateSupportLayer(group: THREE.Group, time: number, scene: SceneKind) { group.children.forEach((child, index) => { if (child.userData.float !== undefined) child.position.y += Math.sin(time * 0.0016 + index) * 0.0008; if (scene === "koi" && child.userData.swim !== undefined) child.rotation.y += 0.002; }); }
function addCylinderBetween(group: THREE.Group, material: THREE.Material, start: THREE.Vector3, end: THREE.Vector3, radius: number) { const direction = new THREE.Vector3().subVectors(end, start); const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.18, direction.length(), 6), material); mesh.position.copy(start).add(end).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()); group.add(mesh); }
function hash2(a: number, b: number) { const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123; return value - Math.floor(value); }
function smootherstep(value: number) { const x = THREE.MathUtils.clamp(value, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); }
