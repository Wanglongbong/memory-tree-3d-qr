import * as THREE from "three";

type Cell = { x: number; z: number; height: number; role: string; phase: number };
export function compactEffects(width: number, height: number, coarse = false) {
  return coarse || Math.min(width, height) <= 720;
}
export function effectBudget(size: number, compact: boolean) {
  return size > 105 ? { leaves: 80, snow: 60 } : compact ? { leaves: 120, snow: 90 } : { leaves: 240, snow: 180 };
}
export function decorationOpacity(mix: number) {
  const t = THREE.MathUtils.clamp(mix / 0.62, 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

// Soft projection of the actual canopy footprint, not opaque grey QR tiles.
export function shadowPixels(cells: Cell[], size: number, resolution = 256) {
  const span = size + 4, field = new Float32Array(resolution * resolution);
  const radius = Math.max(2, resolution / span * 1.8);
  cells.filter((cell) => cell.role === "canopy").forEach((cell) => {
    const px = (cell.x / span + 0.5) * resolution, py = (0.5 - cell.z / span) * resolution;
    for (let y = Math.max(0, Math.floor(py - radius * 2)); y < Math.min(resolution, py + radius * 2); y++) {
      for (let x = Math.max(0, Math.floor(px - radius * 2)); x < Math.min(resolution, px + radius * 2); x++) {
        field[y * resolution + x] += Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (radius * radius)) * 0.22;
      }
    }
  });
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const i = y * resolution + x;
    const contact = Math.exp(-((x / resolution - 0.5) ** 2 + (y / resolution - 0.5) ** 2) / 0.0015) * 0.7;
    pixels.set([255, 255, 255, Math.round(Math.min(0.9, field[i] + contact) * 255)], i * 4);
  }
  return pixels;
}
export function buildSoftShadow(cells: Cell[], size: number, color: string) {
  const texture = new THREE.DataTexture(shadowPixels(cells, size), 256, 256);
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ color, map: texture, transparent: true, opacity: 0.4, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size + 4, size + 4), material);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.185; mesh.name = "soft-canopy-shadow";
  return mesh;
}

export function buildSnowCover(crowns: Cell[], ground: Cell[]) {
  const placements = crowns.filter((_, i) => i % 3 === 0).map((cell) => ({ x: cell.x, z: cell.z, y: cell.height + 0.23, radius: 0.43 }));
  ground.filter((cell, i) => cell.role !== "protected" && i % 7 === 0).forEach((cell) => placements.push({ x: cell.x + 0.36, z: cell.z + 0.28, y: 0.19, radius: 0.36 }));
  const material = new THREE.MeshBasicMaterial({ color: "#f4f4e9", transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 4), material, placements.length);
  const dummy = new THREE.Object3D();
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z); dummy.scale.set(p.radius, 0.055, p.radius * 0.8); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.name = "thin-snow-cover";
  return mesh;
}

export function buildSnowfall(size: number, count: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("flakeScale", new THREE.Float32BufferAttribute(Array.from({ length: count }, (_, i) => 0.65 + random(i, 51) * 0.75), 1));
  // PointsMaterial sizes are pixels with an orthographic camera, not world units.
  const material = new THREE.PointsMaterial({ color: "#fffdf5", size: 3.4, transparent: true, opacity: 0.9, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float flakeScale;\n${shader.vertexShader}`.replace("gl_PointSize = size;", "gl_PointSize = size * flakeScale;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      float radius = length(gl_PointCoord - vec2(0.5));
      diffuseColor.a *= 1.0 - smoothstep(0.18, 0.5, radius);
      if (diffuseColor.a < 0.01) discard;
    `);
  };
  const points = new THREE.Points(geometry, material);
  points.name = "snowfall-and-ground-drift"; points.frustumCulled = false;
  animateSnowfall(points, 0, size);
  return points;
}
export function animateSnowfall(points: THREE.Points, time: number, size: number) {
  const positions = points.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const phase = random(i, 13) * Math.PI * 2, nearGround = i % 5 === 0;
    const progress = (time / (15 + random(i, 21) * 12) + random(i, 32)) % 1;
    const x = (random(i, 3) - 0.5) * size * 0.9 + Math.sin(time * 0.55 + phase) * 0.7;
    const z = (random(i, 7) - 0.5) * size * 0.9 + Math.cos(time * 0.42 + phase) * 0.55;
    const y = nearGround ? 0.45 + (Math.sin(time * 0.8 + phase) + 1) * 0.28 : THREE.MathUtils.lerp(size * 0.82, 0.35, progress);
    positions.setXYZ(i, x, y, z);
  }
  positions.needsUpdate = true;
}
function random(a: number, b: number) { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123; return n - Math.floor(n); }
