import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { classifyDarkModule, createQrMatrix, unpackQrMatrix, type QrMatrix, type QrVisualRole } from "./qr";
import type { MemoryProject, SceneKind, Season, TimeOfDay } from "./project";
import { getScenePalette, type ScenePalette } from "./scenePalette";
import grassBladeAsset from "./assets/grass-blade.json";
import { animateSnowfall, buildSnowCover, buildSnowfall, buildSoftShadow, compactEffects, decorationOpacity, effectBudget } from "./seasonEffects";

type ViewMode = "showcase" | "scan";
type Props = { project: MemoryProject; onShare: () => void; shareLabel: string };
type GrowthCell = {
  x: number; z: number; height: number; canopy: number;
  role: QrVisualRole; phase: number; crownScale: number;
};
type GrassBlade = {
  x: number; z: number; height: number; phase: number; role: QrVisualRole; splayed: boolean;
};
const TREE_HEIGHT = 1.8;
const CANOPY_TIERS = [{ width: 1, level: 0.6 }, { width: 0.78, level: 0.8 }, { width: 0.55, level: 1 }];
type ParticleMotion = { base: Float32Array; speeds: Float32Array; phases: Float32Array };

const sceneNames: Record<SceneKind, string> = { tree: "Cây Kí Ức", lantern: "Vườn Đèn Lồng", koi: "Hồ Koi" };

export function MemoryTreeQr({ project, onShare, shareLabel }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<ViewMode>("showcase");
  const [mode, setModeState] = useState<ViewMode>("showcase");
  const [status, setStatus] = useState("Đang kết tinh vật phẩm từ mã QR…");
  const safePayload = project.payload.trim() || "https://example.com/loi-nhan";
  const palette = getScenePalette(project.scene, project.season, project.time, project.accent, project.floorColor);

  function setMode(next: ViewMode) { modeRef.current = next; setModeState(next); }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const container = mount;
    let matrix: QrMatrix;
    try { matrix = project.matrix ? unpackQrMatrix(project.matrix) : createQrMatrix(safePayload); }
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
    const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, matrix.size * 4 + 100);
    const root = new THREE.Group(); scene.add(root);
    const night = project.time === "night";
    scene.add(new THREE.HemisphereLight(night ? 0xa7b9dd : 0xffe9bb, night ? 0x151b24 : 0x59412a, night ? 1.5 : 2.4));
    const key = new THREE.DirectionalLight(night ? 0x9eb6ff : 0xffd18b, night ? 2.2 : 3.3); key.position.set(-24, 38, 24); scene.add(key);
    const glow = new THREE.PointLight(palette.glow, night ? 24 : 10, matrix.size * 1.4); glow.position.set(0, matrix.size * 0.26, 0); scene.add(glow);

    const entries = createGrowthCells(matrix, project.scene);
    const crowns = project.scene === "tree" ? createTieredCanopy(entries, matrix.size) : entries;
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const groundMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), groundMaterial, entries.length);
    groundMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const grassBlades = project.scene === "tree" ? createGrassBlades(entries, matrix.size) : [];
    const grassGeometry = createGrassGeometry();
    const grassMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide });
    // Splayed blades fade with camera elevation; upright cores never leave their cell.
    const grassTime = { value: 0 }, grassWind = { value: 0 }, grassSplay = { value: 1 };
    grassGeometry.setAttribute("splayed", new THREE.InstancedBufferAttribute(new Float32Array(grassBlades.map((blade) => Number(blade.splayed))), 1));
    grassMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.grassTime = grassTime; shader.uniforms.grassWind = grassWind; shader.uniforms.grassSplay = grassSplay;
      shader.vertexShader = `attribute float splayed; uniform float grassTime; uniform float grassWind; varying float bladeTip; varying float bladeSplayed; varying float bladeFold;\n${shader.vertexShader}`.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        bladeTip = position.y;
        bladeSplayed = splayed;
        bladeFold = normal.z;
        float phase = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 1.7;
        float moving = step(0.0, instanceMatrix[3].y - 0.115);
        float bend = pow(position.y, 2.0) * grassWind * moving;
        // Broad slow gusts travel through neighboring tufts; fine flutter is tip-only.
        float wave = sin(grassTime * 0.85 - instanceMatrix[3].x * 0.22 - instanceMatrix[3].z * 0.16);
        float flutter = sin(grassTime * 1.75 + phase);
        transformed.x += (wave * 0.09 + flutter * 0.025 * position.y) * bend;
        transformed.z += sin(grassTime * 0.65 + phase * 0.4) * 0.065 * bend;
        transformed.x += pow(position.y, 1.8) * splayed * (0.30 + 0.23 * sin(phase));
      `);
      shader.fragmentShader = `uniform float grassSplay; varying float bladeTip; varying float bladeSplayed; varying float bladeFold;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `
        #include <color_fragment>
        diffuseColor.a *= mix(1.0, grassSplay, bladeSplayed);
        if (diffuseColor.a < 0.015) discard;
        diffuseColor.rgb *= mix(0.68, 1.04, smoothstep(0.0, 0.95, bladeTip)) * (0.95 + 0.05 * abs(bladeFold));
        ${project.season === "winter" ? "diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.88), smoothstep(0.78, 1.0, bladeTip) * 0.8 * grassSplay);" : ""}
      `);
    };
    const grassMesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassBlades.length);
    grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const crownMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: project.scene === "tree" });
    const crownMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), crownMaterial, crowns.length);
    crownMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const ornamentMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: project.scene === "tree", roughness: 0.78, flatShading: project.scene !== "koi" });
    const ornamentMesh = new THREE.InstancedMesh(createOrnamentGeometry(project.scene), ornamentMaterial, crowns.length);
    ornamentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const moduleColors = Object.fromEntries((Object.keys(palette.modules) as QrVisualRole[]).map((role) => [role, new THREE.Color(palette.modules[role])])) as Record<QrVisualRole, THREE.Color>;
    const grassColors = (palette.nature?.grass ?? [palette.modules.landscape, palette.modules.roots, palette.modules.canopy]).map((color) => new THREE.Color(color));
    const leafColors = (palette.nature?.leaves ?? [palette.modules.canopy, palette.modules.landscape, palette.modules.roots, palette.glow]).map((color) => new THREE.Color(color));
    entries.forEach((entry, index) => {
      groundMesh.setColorAt(index, project.scene === "tree" && entry.role === "canopy" ? new THREE.Color(palette.floor) : moduleColors[entry.role]);
    });
    crowns.forEach((entry, index) => {
      crownMesh.setColorAt(index, moduleColors[entry.role]);
      ornamentMesh.setColorAt(index, project.scene === "tree" ? leafColors[Math.floor(entry.phase * leafColors.length) % leafColors.length] : moduleColors[entry.role]);
    });
    grassBlades.forEach((blade, index) => grassMesh.setColorAt(index, blade.role === "protected" ? moduleColors.protected : grassColors[Math.floor(blade.phase * grassColors.length) % grassColors.length]));
    if (groundMesh.instanceColor) groundMesh.instanceColor.needsUpdate = true;
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
    if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
    if (ornamentMesh.instanceColor) ornamentMesh.instanceColor.needsUpdate = true;
    root.add(groundMesh, grassMesh, crownMesh, ornamentMesh);

    const treeShadow = project.scene === "tree" ? buildSoftShadow(entries, matrix.size, palette.nature!.shadow) : null;
    if (treeShadow) root.add(treeShadow);

    const scanFloorMaterial = new THREE.MeshBasicMaterial({ color: palette.floor });
    const scanFloor = new THREE.Mesh(new THREE.BoxGeometry(matrix.size + 8, 0.42, matrix.size + 8), scanFloorMaterial); scanFloor.position.y = -0.28; root.add(scanFloor);
    const organicFloorMaterial = new THREE.MeshStandardMaterial({ color: palette.showcaseFloor, transparent: true, roughness: project.scene === "koi" ? 0.3 : 0.92, metalness: project.scene === "koi" ? 0.08 : 0 });
    const organicFloor = new THREE.Mesh(project.scene === "tree" ? new THREE.BoxGeometry(matrix.size + 8, 1.1, matrix.size + 8) : new THREE.CylinderGeometry((matrix.size + 8) * 0.7, (matrix.size + 8) * 0.73, 0.72, project.scene === "koi" ? 48 : 16), organicFloorMaterial);
    organicFloor.position.y = -0.66; root.add(organicFloor);
    const supportLayer = buildSupportLayer(project.scene, crowns, palette, matrix.size); root.add(supportLayer);
    const particles = buildParticles(project.scene, project.season, project.time, palette, matrix.size); root.add(particles);
    const particleOpacity = (particles.material as THREE.PointsMaterial).opacity;

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fallingLeaves = project.scene === "tree" && !reducedMotion ? buildFallingLeaves(crowns, palette, matrix.size) : null;
    if (fallingLeaves) root.add(fallingLeaves);
    const winter = project.scene === "tree" && project.season === "winter";
    const snowCover = winter ? buildSnowCover(crowns, entries) : null;
    const snowfall = winter && !reducedMotion ? buildSnowfall(matrix.size, effectBudget(matrix.size, false).snow) : null;
    if (snowCover) root.add(snowCover);
    if (snowfall) root.add(snowfall);
    if (reducedMotion) particles.visible = false;
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
      targetElevation = THREE.MathUtils.clamp(startElevation - (event.clientY - startY) * 0.006, 0.34, Math.PI / 2);
    }
    function onPointerUp(event: PointerEvent) { dragging = false; if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); }
    renderer.domElement.addEventListener("pointerdown", onPointerDown); renderer.domElement.addEventListener("pointermove", onPointerMove); renderer.domElement.addEventListener("pointerup", onPointerUp); renderer.domElement.addEventListener("pointercancel", onPointerUp);

    function resize() {
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight), aspect = width / height;
      const span = matrix.size + 13;
      if (aspect >= 1) { camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2; }
      else { camera.left = -span / 2; camera.right = span / 2; camera.top = span / aspect / 2; camera.bottom = -span / aspect / 2; }
      camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
      const budget = effectBudget(matrix.size, compactDevice());
      if (fallingLeaves) fallingLeaves.count = Math.min(budget.leaves, fallingLeaves.instanceMatrix.count);
      if (snowfall) snowfall.geometry.setDrawRange(0, budget.snow);
    }
    const observer = new ResizeObserver(resize); observer.observe(container); resize();

    function updateGrowth(growthProgress: number, time: number, windStrength: number) {
      entries.forEach((entry, index) => {
        const local = reducedMotion ? 1 : smootherstep(THREE.MathUtils.clamp(growthProgress * 1.22 - entry.phase * 0.22, 0, 1));
        const groundWidth = (entry.role === "protected" ? 1 : 0.96) * local;
        cellScale.set(Math.max(0.001, groundWidth), Math.max(0.001, 0.16 * local), Math.max(0.001, groundWidth));
        dummy.position.set(entry.x, 0.08 * local, entry.z); dummy.rotation.set(0, 0, 0); dummy.scale.copy(cellScale); dummy.updateMatrix(); groundMesh.setMatrixAt(index, dummy.matrix);
      });
      crowns.forEach((entry, index) => {
        const local = reducedMotion ? 1 : smootherstep(THREE.MathUtils.clamp(growthProgress * 1.22 - entry.phase * 0.22, 0, 1));
        const crownY = THREE.MathUtils.lerp(0.2, entry.height, local);
        const crownWidth = 0.96 * local * entry.canopy;
        cellScale.set(Math.max(0.001, crownWidth), Math.max(0.001, 0.2 * local), Math.max(0.001, crownWidth));
        const leafWind = Math.sin(time * 0.00135 + entry.phase * 19) * 0.045 * windStrength;
        dummy.position.set(entry.x, crownY, entry.z); dummy.rotation.set(leafWind * 0.55, 0, leafWind); dummy.scale.copy(cellScale); dummy.updateMatrix(); crownMesh.setMatrixAt(index, dummy.matrix);

        const ornamentSize = entry.crownScale * local * entry.canopy;
        ornamentScale.setScalar(Math.max(0.0001, ornamentSize));
        if (project.scene === "lantern") ornamentScale.set(ornamentSize * 0.72, ornamentSize * 1.08, ornamentSize * 0.72);
        if (project.scene === "koi") ornamentScale.set(ornamentSize * 1.3, ornamentSize * 0.24, ornamentSize);
        dummy.position.set(entry.x, crownY - 0.12, entry.z); dummy.rotation.set(leafWind, entry.phase * Math.PI * 2, leafWind * 0.7); dummy.scale.copy(ornamentScale); dummy.updateMatrix(); ornamentMesh.setMatrixAt(index, dummy.matrix);
      });
      groundMesh.instanceMatrix.needsUpdate = true; crownMesh.instanceMatrix.needsUpdate = true; ornamentMesh.instanceMatrix.needsUpdate = true;

      grassBlades.forEach((blade, index) => {
        const local = reducedMotion ? 1 : smootherstep(THREE.MathUtils.clamp(growthProgress * 1.25 - blade.phase * 0.18, 0, 1));
        dummy.position.set(blade.x, blade.role === "protected" ? 0.11 : 0.12, blade.z);
        dummy.rotation.set(0, blade.phase * Math.PI, 0);
        dummy.scale.set(1, Math.max(0.001, blade.height * local), 1);
        dummy.updateMatrix(); grassMesh.setMatrixAt(index, dummy.matrix);
      });
      grassMesh.instanceMatrix.needsUpdate = true;
    }

    function updateViewLayers(mix: number) {
      organicFloorMaterial.opacity = project.scene === "tree" ? 1 : 1 - smootherstep(THREE.MathUtils.clamp((mix - 0.45) / 0.45, 0, 1)); organicFloor.visible = organicFloorMaterial.opacity > 0.01;
      setLayerOpacity(supportLayer, 1 - smootherstep(THREE.MathUtils.clamp((mix - 0.25) / 0.54, 0, 1)));
      if (project.scene === "tree") {
        const qrAlignment = smootherstep(THREE.MathUtils.clamp((mix - 0.04) / 0.84, 0, 1));
        crownMaterial.opacity = 1; crownMaterial.depthWrite = true;
        ornamentMaterial.opacity = 1 - qrAlignment; ornamentMaterial.depthWrite = false; ornamentMesh.visible = qrAlignment < 0.999;
        if (treeShadow) { treeShadow.material.opacity = (night ? 0.22 : 0.42) * decorationOpacity(mix); treeShadow.visible = mix < 0.62; }
      }
      if (snowCover) { snowCover.material.opacity = decorationOpacity(mix); snowCover.visible = mix < 0.62; }
      if (snowfall) { snowfall.material.opacity = 0.9 * decorationOpacity(mix); snowfall.visible = mix < 0.62; }
      particles.visible = !winter && !reducedMotion && mix < 0.62;
      (particles.material as THREE.PointsMaterial).opacity = particleOpacity * (1 - smootherstep(mix / 0.62));
      if (fallingLeaves) {
        fallingLeaves.visible = mix < 0.62;
        fallingLeaves.material.opacity = 1 - smootherstep(mix / 0.62);
      }
    }

    updateGrowth(startsInScan ? 1 : 0, bornAt, 0);
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
      if (Math.abs(currentElevation - targetElevation) < 0.0001) currentElevation = targetElevation;
      if (Math.abs(currentYaw - targetYaw) < 0.0001) currentYaw = targetYaw;
      const elevationMix = smootherstep(THREE.MathUtils.clamp((currentElevation - 0.72) / (Math.PI / 2 - 0.72), 0, 1));
      const desiredMix = activeMode === "scan" ? 1 : elevationMix;
      scanMix = THREE.MathUtils.lerp(scanMix, desiredMix, easing);
      if (Math.abs(scanMix - desiredMix) < 0.0001) scanMix = desiredMix;
      const growthProgress = activeMode === "scan" ? 1 : THREE.MathUtils.clamp((now - bornAt) / 1900, 0, 1);
      const windStrength = reducedMotion ? 0 : 1 - smootherstep(scanMix);
      grassTime.value = now * 0.001; grassWind.value = reducedMotion ? 0 : THREE.MathUtils.lerp(1, 0.35, smootherstep(scanMix));
      grassSplay.value = 1 - smootherstep((currentElevation - THREE.MathUtils.degToRad(65)) / THREE.MathUtils.degToRad(23));
      if (Math.abs(growthProgress - previousGrowth) > 0.001 || (project.scene === "tree" && Math.abs(scanMix - previousMix) > 0.001)) { updateGrowth(growthProgress, now, windStrength); previousGrowth = growthProgress; }
      if (Math.abs(scanMix - previousMix) > 0.001) { updateViewLayers(scanMix); previousMix = scanMix; }
      if (!reducedMotion && !dragging && activeMode === "showcase" && scanMix < 0.12) targetYaw += delta * 0.045;
      root.rotation.y = currentYaw * (1 - smootherstep(scanMix));
      const distance = matrix.size * 1.72; const lookHeight = THREE.MathUtils.lerp(project.scene === "tree" ? matrix.size * 0.255 : project.scene === "lantern" ? matrix.size * 0.1 : 0, 0, smootherstep(scanMix));
      camera.position.set(0, lookHeight + Math.sin(currentElevation) * distance, Math.max(0.001, Math.cos(currentElevation) * distance));
      cameraUp.lerpVectors(showUp, scanUp, smootherstep(scanMix)).normalize(); camera.up.copy(cameraUp);
      const showcaseZoom = project.scene === "tree" ? Math.min(1.06, (camera.right - camera.left) / (Math.SQRT2 * (matrix.size + 8) + 2), (camera.top - camera.bottom) / (matrix.size * 1.1 + 8)) : project.scene === "lantern" ? 1.1 : 1.04;
      camera.zoom = THREE.MathUtils.lerp(showcaseZoom, 1, smootherstep(scanMix)); camera.updateProjectionMatrix(); camera.lookAt(0, lookHeight, 0);
      if (!reducedMotion) { animateParticles(particles, now, delta, project.scene, project.season, matrix.size); animateSupportLayer(supportLayer, now, project.scene); }
      if (fallingLeaves?.visible) animateFallingLeaves(fallingLeaves, (now - bornAt) * 0.001, matrix.size);
      if (snowfall?.visible) animateSnowfall(snowfall, (now - bornAt) * 0.001, matrix.size);
      renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    }
    setStatus("Kéo thẳng lên để ghép lá, cỏ và bóng cây thành mã QR"); frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown); renderer.domElement.removeEventListener("pointermove", onPointerMove); renderer.domElement.removeEventListener("pointerup", onPointerUp); renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      const materials = new Set<THREE.Material>(); const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); const material = mesh.material; if (material) (Array.isArray(material) ? material : [material]).forEach((item) => materials.add(item)); });
      geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose()); treeShadow?.material.map?.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [safePayload, project.matrix, project.scene, project.season, project.time, project.accent, project.floorColor]);

  async function downloadQr(hd: boolean) {
    const matrix = project.matrix ? unpackQrMatrix(project.matrix) : createQrMatrix(safePayload); const size = hd ? 3200 : 1600, footer = hd ? 160 : 96, cells = matrix.size + 8;
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
    <p className="security-line">⌾ Cỏ xòe khi nhìn nghiêng; từ trên cao, ngọn cỏ và tán lá ghép đúng từng ô mã QR.</p>
  </article>;
}

export function createGrowthCells(matrix: QrMatrix, scene: SceneKind): GrowthCell[] {
  const entries: GrowthCell[] = []; const centre = (matrix.size - 1) / 2;
  matrix.modules.forEach((row, r) => row.forEach((dark, c) => {
    if (!dark) return;
    const x = c - centre, z = r - centre, role = classifyDarkModule(r, c, matrix.size), seed = hash2(r, c), phase = seed;
    const radius = Math.hypot(x, z) / (matrix.size * 0.72);
    const dome = Math.sqrt(Math.max(0, 1 - Math.min(1, radius) ** 2));
    const treeRadius = Math.hypot(x, z) / (matrix.size * 0.235);
    const treeDome = Math.max(0, 1 - Math.pow(Math.min(1, treeRadius), 1.55));
    const canopy = scene === "tree" && role !== "canopy" ? 0 : 1;
    const height = scene === "tree" ? matrix.size * (0.255 + treeDome * 0.145) + seed * 0.42 : scene === "lantern" ? 0.38 + matrix.size * (0.025 + dome * 0.1) + (seed - 0.5) * 0.48 : 0.38 + seed * 0.3;
    entries.push({ x, z, height, canopy, role, phase, crownScale: scene === "tree" ? 0.33 + treeDome * 0.09 + seed * 0.055 : scene === "lantern" ? 0.42 + seed * 0.08 : 0.38 + seed * 0.08 });
  }));
  return entries;
}

export function createTieredCanopy(entries: GrowthCell[], size: number): GrowthCell[] {
  return CANOPY_TIERS.flatMap((tier) => entries.filter((entry) => entry.canopy && Math.hypot(entry.x, entry.z) <= size * 0.235 * tier.width).map((entry) => {
    const dome = Math.max(0, 1 - Math.pow(Math.hypot(entry.x, entry.z) / (size * 0.235 * tier.width), 1.55));
    return { ...entry, height: size * 0.4 * TREE_HEIGHT * (tier.level - 0.13 + dome * 0.13) + entry.phase * 0.35 };
  }));
}

export function createGrassBlades(entries: GrowthCell[], size: number): GrassBlade[] {
  const blades: GrassBlade[] = [];
  entries.forEach((entry, cellIndex) => {
    if (entry.canopy > 0.42) return;
    const coreCount = size > 105 ? 3 : 5;
    const count = entry.role === "protected" ? coreCount : coreCount + (size > 105 ? 2 : window.innerWidth <= 720 ? 3 : 5);
    for (let bladeIndex = 0; bladeIndex < count; bladeIndex += 1) {
      const seedX = hash2(cellIndex * 7 + bladeIndex, 17);
      const seedZ = hash2(cellIndex * 11 + bladeIndex, 29);
      blades.push({
        x: entry.x + (seedX - 0.5) * 0.4,
        z: entry.z + (seedZ - 0.5) * 0.4,
        height: 0.58 + hash2(cellIndex * 13 + bladeIndex, 41) * 0.97,
        phase: hash2(cellIndex * 19 + bladeIndex, 53),
        role: entry.role,
        splayed: bladeIndex >= coreCount,
      });
    }
  });
  return blades;
}

export function createGrassGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(grassBladeAsset.positions, 3));
  geometry.setIndex(grassBladeAsset.indices);
  geometry.computeVertexNormals();
  return geometry;
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
    const height = size * 0.37 * TREE_HEIGHT;
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(size * 0.05, height, size * 0.05), main); trunk.position.y = height / 2; group.add(trunk);
    [[-0.035, 0, 0.018, 0], [0.035, 0, 0.018, 0], [0, 0, 0.035, Math.PI / 2], [0, 0, -0.035, Math.PI / 2]].forEach(([x, y, z, rotation]) => {
      const root = new THREE.Mesh(new THREE.BoxGeometry(size * 0.088, size * 0.012, size * 0.015), main);
      root.position.set(size * x, size * 0.008 + y, size * z); root.rotation.y = rotation; group.add(root);
    });
    const branchPoints: Array<[number, number, number, number, number, number, number]> = [
      [0, .175, 0, .178, .298, .068, .021], [0, .183, 0, -.176, .31, .073, .021],
      [0, .198, 0, .127, .346, -.129, .019], [0, .202, 0, -.137, .341, -.124, .019],
      [0, .215, 0, .024, .393, .007, .018], [0, .227, 0, .161, .346, -.02, .015],
      [0, .232, 0, -.154, .359, -.012, .014], [.044, .256, .017, .117, .324, .107, .01],
      [-.041, .261, .02, -.115, .334, .102, .01], [.029, .276, -.027, .093, .361, -.105, .01],
      [-.027, .278, -.024, -.095, .356, -.102, .01], [.01, .293, .005, .054, .378, .059, .009],
      [-.01, .295, .002, -.056, .373, .054, .009],
    ];
    CANOPY_TIERS.forEach((tier) => branchPoints.forEach(([sx, sy, sz, ex, ey, ez, width]) => {
      const tierY = (y: number) => size * 0.4 * TREE_HEIGHT * (tier.level - 0.13 + ((y - 0.255) / 0.145) * 0.13);
      addCylinderBetween(group, main, new THREE.Vector3(sx * size * tier.width, tierY(sy), sz * size * tier.width), new THREE.Vector3(ex * size * tier.width, tierY(ey), ez * size * tier.width), width * size * tier.width * 0.7);
    }));

    const canopyEntries = entries.filter((entry) => entry.role === "canopy");
    const leafGeometry = new THREE.BoxGeometry(0.9, 0.48, 0.9);
    const leafPalette = (palette.nature?.leaves ?? [palette.modules.canopy, palette.modules.landscape, palette.modules.roots, palette.glow]).map((color) => new THREE.Color(color));
    const leafMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const decorativeLeaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, canopyEntries.length * 2);
    const leafDummy = new THREE.Object3D(); let leafIndex = 0;
    canopyEntries.forEach((entry, entryIndex) => {
      for (let layer = 0; layer < 2; layer += 1) {
        const seed = hash2(entryIndex * 5 + layer, 103); const scale = 0.8 + hash2(entryIndex * 7 + layer, 107) * 0.46;
        leafDummy.position.set(entry.x * 1.18 + (seed - 0.5) * 0.72, entry.height + layer * 0.42 + (hash2(entryIndex, layer + 109) - 0.5) * 0.46, entry.z * 1.18 + (hash2(entryIndex * 11 + layer, 113) - 0.5) * 0.72);
        leafDummy.rotation.set((seed - 0.5) * 0.32, seed * Math.PI, (hash2(entryIndex, layer + 127) - 0.5) * 0.24);
        leafDummy.scale.set(scale * (0.88 + seed * 0.28), scale, scale * (0.88 + hash2(entryIndex, layer + 131) * 0.28));
        leafDummy.updateMatrix(); decorativeLeaves.setMatrixAt(leafIndex, leafDummy.matrix); decorativeLeaves.setColorAt(leafIndex, leafPalette[leafIndex % leafPalette.length]); leafIndex += 1;
      }
    });
    decorativeLeaves.instanceMatrix.needsUpdate = true; if (decorativeLeaves.instanceColor) decorativeLeaves.instanceColor.needsUpdate = true; group.add(decorativeLeaves);

    for (let i = 0; i < 5; i += 1) {
      const x = [-.107, .105, .078, -.083, .02][i] * size; const y = [.32, .33, .43, .44, .57][i] * size; const z = [.068, .066, -.085, -.083, .012][i] * size;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.001, size * 0.001, size * 0.028, 5), main); cord.position.set(x, y + size * 0.014, z); group.add(cord);
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.0075, size * 0.018, 8), accent); lantern.position.set(x, y, z); lantern.userData.float = i; group.add(lantern);
    }
  } else if (scene === "lantern") {
    for (let i = -4; i <= 4; i += 1) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, size * 0.18, 6), main); pole.position.set(i * size * 0.035, size * 0.09, (i % 2) * size * 0.07); group.add(pole); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(size * 0.42, 0.42, 0.58), main); beam.position.y = size * 0.19; group.add(beam);
  } else {
    for (let i = 0; i < 7; i += 1) { const fish = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 7), i % 2 ? accent : main); body.scale.set(1.7, 0.4, 0.65); fish.add(body); const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.75, 3), i % 2 ? accent : main); tail.rotation.z = Math.PI / 2; tail.position.x = -0.9; fish.add(tail); fish.position.set(Math.sin(i * 2.2) * size * 0.18, 0.1, Math.cos(i * 1.55) * size * 0.18); fish.rotation.y = i * 0.8; fish.userData.swim = i; group.add(fish); }
  }
  return group;
}

export function buildFallingLeaves(crowns: GrowthCell[], palette: ScenePalette, size: number) {
  const count = crowns.length ? effectBudget(size, false).leaves : 0;
  const geometry = new THREE.OctahedronGeometry(0.5, 0); geometry.scale(0.55, 0.08, 1);
  geometry.setAttribute("leafOpacity", new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float leafOpacity; varying float fallingOpacity;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nfallingOpacity = leafOpacity;");
    shader.fragmentShader = `varying float fallingOpacity;\n${shader.fragmentShader}`.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= fallingOpacity;");
  };
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "falling-canopy-leaves"; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Animated instances may drift outside their initial bounds.
  mesh.frustumCulled = false;
  mesh.userData.origins = Array.from({ length: count }, (_, i) => crowns[Math.floor(hash2(i, 191) * crowns.length)]);
  const colors = palette.nature!.leaves.map((color) => new THREE.Color(color));
  for (let i = 0; i < count; i++) mesh.setColorAt(i, colors[i % colors.length]);
  mesh.userData.dummy = new THREE.Object3D();
  mesh.count = Math.min(count, effectBudget(size, compactDevice()).leaves);
  return mesh;
}

function compactDevice() {
  return compactEffects(window.innerWidth, window.innerHeight || window.innerWidth, window.matchMedia?.("(pointer: coarse)").matches ?? false);
}

export function animateFallingLeaves(mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, time: number, size: number) {
  const origins = mesh.userData.origins as GrowthCell[];
  const dummy = mesh.userData.dummy as THREE.Object3D;
  const opacity = mesh.geometry.getAttribute("leafOpacity") as THREE.InstancedBufferAttribute;
  origins.forEach((origin, i) => {
    const duration = 9 + hash2(i, 197) * 9;
    const progress = (time / duration + hash2(i, 199)) % 1;
    const phase = hash2(i, 211) * Math.PI * 2;
    const drift = size * 0.055 * progress;
    dummy.position.set(origin.x * 1.18 + Math.sin(time * 0.8 + phase) * 0.65 + Math.cos(phase) * drift, THREE.MathUtils.lerp(origin.height, 0.3, progress), origin.z * 1.18 + Math.cos(time * 0.65 + phase) * 0.5 + Math.sin(phase) * drift);
    dummy.rotation.set(time * (0.8 + hash2(i, 223)) + phase, phase + time * 0.35, Math.sin(time * 1.4 + phase) * 0.85);
    dummy.scale.setScalar(0.45 + hash2(i, 227) * 0.55); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    opacity.setX(i, smootherstep(progress / 0.08) * (1 - smootherstep((progress - 0.82) / 0.18)));
  });
  mesh.instanceMatrix.needsUpdate = true; opacity.needsUpdate = true;
}

function buildParticles(scene: SceneKind, season: Season, time: TimeOfDay, palette: ScenePalette, size: number) {
  const compact = window.matchMedia("(max-width: 720px)").matches;
  const count = scene === "tree" ? (compact ? 18 : 30) : scene === "koi" ? 24 : 36;
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), base = new Float32Array(count * 3);
  const speeds = new Float32Array(count), phases = new Float32Array(count);
  const seasonalColors = season === "autumn"
    ? (palette.nature?.leaves ?? [palette.glow])
    : season === "spring"
      ? [palette.nature?.effect ?? palette.glow, "#f8d7df", palette.nature?.leaves[3] ?? "#b7d477"]
      : season === "winter"
        ? [palette.nature?.effect ?? "#edf6f3", "#ffffff", palette.nature?.leaves[3] ?? "#b7c7c0"]
        : [palette.nature?.effect ?? palette.glow, "#f3e992", "#bfd36f"];
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    positions[offset] = (hash2(i, 2) - 0.5) * size * 0.65;
    positions[offset + 1] = (season === "summer" ? 2 : 1) + hash2(i, 5) * size * (season === "summer" ? 0.3 : 0.42);
    positions[offset + 2] = (hash2(i, 8) - 0.5) * size * 0.65;
    base.set(positions.subarray(offset, offset + 3), offset);
    speeds[i] = season === "winter" ? 0.55 + hash2(i, 13) * 0.55 : season === "spring" ? 0.72 + hash2(i, 13) * 0.7 : 1.05 + hash2(i, 13) * 1.1;
    phases[i] = hash2(i, 21) * Math.PI * 2;
    new THREE.Color(seasonalColors[i % seasonalColors.length]).toArray(colors, offset);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (scene === "tree") geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const pointSize = scene === "koi" ? 0.14 : scene !== "tree" ? 0.23 : season === "spring" ? 0.32 : season === "summer" ? 0.2 : season === "autumn" ? 0.34 : 0.24;
  const material = new THREE.PointsMaterial({ color: scene === "tree" ? 0xffffff : palette.glow, vertexColors: scene === "tree", size: pointSize, transparent: true, opacity: scene === "tree" && season === "summer" && time === "night" ? 0.9 : 0.72 });
  const points = new THREE.Points(geometry, material);
  points.userData.motion = { base, speeds, phases } satisfies ParticleMotion;
  return points;
}

function animateParticles(points: THREE.Points, time: number, delta: number, scene: SceneKind, season: Season, size: number) {
  if (scene !== "tree") { points.rotation.y += delta * 0.07; return; }
  const attribute = points.geometry.getAttribute("position") as THREE.BufferAttribute;
  const positions = attribute.array as Float32Array;
  const motion = points.userData.motion as ParticleMotion;
  for (let i = 0; i < motion.speeds.length; i += 1) {
    const offset = i * 3, phase = motion.phases[i];
    if (season === "summer") {
      positions[offset] = motion.base[offset] + Math.sin(time * 0.00055 + phase) * 0.42;
      positions[offset + 1] = motion.base[offset + 1] + Math.sin(time * 0.0014 + phase * 1.7) * 0.5;
      positions[offset + 2] = motion.base[offset + 2] + Math.cos(time * 0.00048 + phase) * 0.36;
      continue;
    }
    positions[offset] = motion.base[offset] + Math.sin(time * 0.0007 + phase) * (season === "winter" ? 0.28 : 0.48);
    positions[offset + 1] -= motion.speeds[i] * delta;
    positions[offset + 2] = motion.base[offset + 2] + Math.cos(time * 0.00058 + phase) * (season === "winter" ? 0.2 : 0.34);
    if (positions[offset + 1] < 0.35) {
      positions[offset + 1] = size * (0.34 + hash2(i, Math.floor(time * 0.001)) * 0.12);
      motion.base[offset] = (hash2(i, Math.floor(time * 0.0007) + 31) - 0.5) * size * 0.65;
      motion.base[offset + 2] = (hash2(i, Math.floor(time * 0.0009) + 47) - 0.5) * size * 0.65;
    }
  }
  attribute.needsUpdate = true;
  if (season === "autumn") points.rotation.y += delta * 0.045;
}

function setLayerOpacity(group: THREE.Group, opacity: number) {
  group.visible = opacity > 0.01;
  group.traverse((object) => { const mesh = object as THREE.Mesh; const material = mesh.material; if (!material) return; (Array.isArray(material) ? material : [material]).forEach((item) => { item.transparent = true; item.opacity = opacity; item.depthWrite = opacity > 0.5; }); });
}

function animateSupportLayer(group: THREE.Group, time: number, scene: SceneKind) { group.children.forEach((child, index) => { if (child.userData.float !== undefined) child.position.y += Math.sin(time * 0.0016 + index) * 0.0008; if (scene === "koi" && child.userData.swim !== undefined) child.rotation.y += 0.002; }); }
function addCylinderBetween(group: THREE.Group, material: THREE.Material, start: THREE.Vector3, end: THREE.Vector3, radius: number) { const direction = new THREE.Vector3().subVectors(end, start); const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.18, direction.length(), 6), material); mesh.position.copy(start).add(end).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()); group.add(mesh); }
function hash2(a: number, b: number) { const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123; return value - Math.floor(value); }
function smootherstep(value: number) { const x = THREE.MathUtils.clamp(value, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); }
