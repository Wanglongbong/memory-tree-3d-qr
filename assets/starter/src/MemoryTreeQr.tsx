import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import * as THREE from "three";
import { classifyDarkModule, createQrMatrix, isNavigableUrl, type QrMatrix, type QrVisualRole } from "./qr";

type ViewMode = "showcase" | "scan";

type MemoryTreeQrProps = {
  payload: string;
};

const showcaseColors: Record<QrVisualRole, THREE.Color> = {
  protected: new THREE.Color("#284934"),
  canopy: new THREE.Color("#c0832f"),
  roots: new THREE.Color("#7c3f28"),
  landscape: new THREE.Color("#7b7040"),
};

const scanColor = new THREE.Color("#171d18");

export function MemoryTreeQr({ payload }: MemoryTreeQrProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<ViewMode>("showcase");
  const [mode, setMode] = useState<ViewMode>("showcase");
  const [flatQr, setFlatQr] = useState("");
  const [status, setStatus] = useState("Đang dựng Cây Ký Ức…");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let active = true;
    setFlatQr("");
    void QRCode.toDataURL(payload, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 768,
      color: { dark: "#171d18ff", light: "#fffaf0ff" },
    })
      .then((url) => active && setFlatQr(url))
      .catch(() => active && setStatus("Nội dung này quá dài để tạo mã QR."));
    return () => {
      active = false;
    };
  }, [payload]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const container: HTMLDivElement = mount;

    let matrix: QrMatrix;
    try {
      matrix = createQrMatrix(payload);
    } catch {
      setStatus("Không thể tạo mã QR từ nội dung hiện tại.");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setStatus("Thiết bị không mở được WebGL. Hãy dùng mã 2D dự phòng bên dưới.");
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "memory-tree-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 240);
    camera.up.set(0, 0, -1);
    const root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.HemisphereLight(0xffe5a6, 0x281814, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffc96b, 3.1);
    keyLight.position.set(-18, 32, 24);
    scene.add(keyLight);

    const plateSize = matrix.size + 8;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(plateSize, 0.35, plateSize),
      new THREE.MeshBasicMaterial({ color: 0xfffaf0 }),
    );
    plate.position.y = -0.22;
    root.add(plate);

    const entries: Array<{ x: number; z: number; role: QrVisualRole }> = [];
    const centre = (matrix.size - 1) / 2;
    matrix.modules.forEach((row, rowIndex) => {
      row.forEach((dark, columnIndex) => {
        if (!dark) return;
        entries.push({
          x: columnIndex - centre,
          z: rowIndex - centre,
          role: classifyDarkModule(rowIndex, columnIndex, matrix.size),
        });
      });
    });

    const moduleGeometry = new THREE.BoxGeometry(0.92, 0.42, 0.92);
    const moduleMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const modules = new THREE.InstancedMesh(moduleGeometry, moduleMaterial, entries.length);
    const dummy = new THREE.Object3D();
    entries.forEach((entry, index) => {
      dummy.position.set(entry.x, 0.17, entry.z);
      dummy.updateMatrix();
      modules.setMatrixAt(index, dummy.matrix);
      modules.setColorAt(index, showcaseColors[entry.role]);
    });
    modules.instanceMatrix.needsUpdate = true;
    if (modules.instanceColor) modules.instanceColor.needsUpdate = true;
    root.add(modules);

    const storyLayer = buildStoryLayer(matrix.size);
    root.add(storyLayer);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scanMix = 0;
    let previousColorMix = -1;
    let targetYaw = -0.48;
    let currentYaw = targetYaw;
    let dragging = false;
    let pointerX = 0;
    let startingYaw = targetYaw;
    let lastTime = performance.now();
    const mixedColor = new THREE.Color();
    const showcaseCamera = new THREE.Vector3(matrix.size * 0.78, matrix.size * 0.66, matrix.size * 0.9);
    const scanCamera = new THREE.Vector3(0, matrix.size + 26, 0.001);
    const desiredCamera = new THREE.Vector3();

    function onPointerDown(event: PointerEvent) {
      if (modeRef.current !== "showcase") return;
      dragging = true;
      pointerX = event.clientX;
      startingYaw = targetYaw;
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging || modeRef.current !== "showcase") return;
      targetYaw = startingYaw + (event.clientX - pointerX) * 0.008;
    }

    function onPointerUp(event: PointerEvent) {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);

    function resize() {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const aspect = width / height;
      const span = matrix.size + 12;
      if (aspect >= 1) {
        camera.left = (-span * aspect) / 2;
        camera.right = (span * aspect) / 2;
        camera.top = span / 2;
        camera.bottom = -span / 2;
      } else {
        camera.left = -span / 2;
        camera.right = span / 2;
        camera.top = span / aspect / 2;
        camera.bottom = -span / aspect / 2;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frame = 0;
    function animate(time: number) {
      const delta = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;
      const targetScan = modeRef.current === "scan" ? 1 : 0;
      const easing = reducedMotion ? 1 : 1 - Math.exp(-delta * 6.5);
      scanMix = THREE.MathUtils.lerp(scanMix, targetScan, easing);

      if (!reducedMotion && !dragging && modeRef.current === "showcase") targetYaw += delta * 0.08;
      currentYaw = THREE.MathUtils.lerp(currentYaw, targetYaw, easing);
      root.rotation.y = currentYaw * (1 - scanMix);

      desiredCamera.lerpVectors(showcaseCamera, scanCamera, smoothstep(scanMix));
      camera.position.lerp(desiredCamera, easing);
      camera.zoom = THREE.MathUtils.lerp(0.88, 1, smoothstep(scanMix));
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);

      storyLayer.visible = scanMix < 0.86;
      storyLayer.scale.setScalar(THREE.MathUtils.lerp(1, 0.82, scanMix));

      if (Math.abs(scanMix - previousColorMix) > 0.004 || targetScan === scanMix) {
        entries.forEach((entry, index) => {
          mixedColor.lerpColors(showcaseColors[entry.role], scanColor, scanMix);
          modules.setColorAt(index, mixedColor);
        });
        if (modules.instanceColor) modules.instanceColor.needsUpdate = true;
        previousColorMix = scanMix;
      }

      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }

    camera.position.copy(showcaseCamera);
    camera.lookAt(0, 0, 0);
    setStatus("Kéo ngang để xoay · Chuyển sang Quét mã để dùng camera");
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [payload]);

  return (
    <section className="memory-tree-card" aria-label="Cây Ký Ức QR 3D">
      <div className="memory-tree-toolbar" role="group" aria-label="Chọn góc nhìn">
        <button className={mode === "showcase" ? "is-active" : ""} onClick={() => setMode("showcase")}>
          <span aria-hidden="true">🌳</span> Trưng bày 3D
        </button>
        <button className={mode === "scan" ? "is-active" : ""} onClick={() => setMode("scan")}>
          <span aria-hidden="true">⌗</span> Quét mã
        </button>
      </div>

      <div className="memory-tree-stage" data-mode={mode}>
        <div ref={mountRef} className="memory-tree-render" />
        <div className="memory-tree-caption">
          <strong>{mode === "scan" ? "Góc nhìn quét an toàn" : "Cây Ký Ức đang kể chuyện"}</strong>
          <span>{mode === "scan" ? "Giữ màn hình thẳng và đủ sáng" : status}</span>
        </div>
      </div>

      <div className="memory-tree-meta">
        <div>
          <span>Nội dung đang mã hóa</span>
          <code>{payload}</code>
        </div>
        {isNavigableUrl(payload) && (
          <a href={payload} target="_blank" rel="noreferrer">Mở đường dẫn</a>
        )}
      </div>

      <details className="memory-tree-fallback">
        <summary>Mở mã QR 2D dự phòng</summary>
        {flatQr ? (
          <div>
            <img src={flatQr} alt={`Mã QR dự phòng cho ${payload}`} />
            <a href={flatQr} download="memory-tree-qr.png">Tải PNG</a>
          </div>
        ) : (
          <p>Đang tạo mã dự phòng…</p>
        )}
      </details>
    </section>
  );
}

function buildStoryLayer(size: number) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6f3423, roughness: 0.9, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd19a37, emissive: 0x5b260c, emissiveIntensity: 0.35, roughness: 0.78, flatShading: true });
  const red = new THREE.MeshStandardMaterial({ color: 0x9d3b29, emissive: 0x39100a, emissiveIntensity: 0.3, roughness: 0.8, flatShading: true });
  const green = new THREE.MeshStandardMaterial({ color: 0x66723d, roughness: 0.95, flatShading: true });

  const trunkHeight = Math.max(6, size * 0.18);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.35, trunkHeight, 7), wood);
  trunk.position.y = trunkHeight / 2 + 0.35;
  group.add(trunk);

  const crownY = trunkHeight + 0.8;
  const branchTips = [
    new THREE.Vector3(-4.8, crownY - 0.4, -1.8),
    new THREE.Vector3(4.5, crownY + 0.2, -1.3),
    new THREE.Vector3(-2.8, crownY + 2.2, 2.7),
    new THREE.Vector3(3.2, crownY + 2.5, 2.4),
  ];
  branchTips.forEach((tip) => addCylinderBetween(group, wood, new THREE.Vector3(0, trunkHeight * 0.65, 0), tip, 0.42));

  const leafGeometry = new THREE.IcosahedronGeometry(2.1, 1);
  const leafMaterials = [gold, red, green];
  const crownPositions = [
    [-4.8, -1.6], [-2.2, -3.1], [0.3, -2.8], [3.2, -2.3], [5.0, -0.2],
    [-5.2, 1.3], [-2.8, 1.4], [0, 0], [2.7, 0.8], [4.5, 2.1],
    [-3.1, 3.5], [-0.3, 3.1], [2.5, 3.4], [0.2, 5.0],
  ] as const;
  crownPositions.forEach(([x, z], index) => {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterials[index % leafMaterials.length]);
    leaf.position.set(x, crownY + 1.2 + (index % 3) * 0.55, z);
    leaf.scale.setScalar(0.82 + (index % 4) * 0.07);
    leaf.rotation.set(index * 0.3, index * 0.7, index * 0.2);
    group.add(leaf);
  });

  const rootTips = [
    new THREE.Vector3(-5.4, 0.32, -3), new THREE.Vector3(5.1, 0.32, -2.4),
    new THREE.Vector3(-4.1, 0.32, 4.2), new THREE.Vector3(4.7, 0.32, 3.6),
  ];
  rootTips.forEach((tip) => addCylinderBetween(group, wood, new THREE.Vector3(0, 0.5, 0), tip, 0.3));

  const lanternGeometry = new THREE.BoxGeometry(0.52, 0.72, 0.52);
  branchTips.forEach((tip, index) => {
    const lantern = new THREE.Mesh(lanternGeometry, index % 2 ? gold : red);
    lantern.position.copy(tip).add(new THREE.Vector3(0, -1.25, 0));
    group.add(lantern);
  });
  return group;
}

function addCylinderBetween(
  parent: THREE.Group,
  material: THREE.Material,
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.7, width, direction.length(), 6), material);
  branch.position.copy(start).add(end).multiplyScalar(0.5);
  branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  parent.add(branch);
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}
