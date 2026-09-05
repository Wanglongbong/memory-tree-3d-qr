import assert from "node:assert/strict";
import { sourceModule } from "./source-module.mjs";

const { createQrMatrix } = await sourceModule("src/qr.ts");
const { getScenePalette } = await sourceModule("src/scenePalette.ts");
const { createGrowthCells, createTieredCanopy, createGrassBlades, createGrassGeometry, buildFallingLeaves, animateFallingLeaves } = await sourceModule("src/MemoryTreeQr.tsx");
const grassGeometry = createGrassGeometry();
const positions = grassGeometry.getAttribute("position");
assert.equal(positions.count, 24, "Blender folded blade is lightweight");
assert.equal(grassGeometry.index.count / 3, 28);
for (let i = 0; i < positions.count; i++) {
  assert(positions.getY(i) >= 0 && positions.getY(i) <= 1);
  // Rotate any direction: geometry + maximum combined wind + root offset remains within the cell.
  assert(Math.hypot(positions.getX(i), positions.getZ(i)) + Math.hypot(0.115, 0.065) + Math.SQRT2 * 0.2 < 0.5);
}
assert(grassGeometry.getAttribute("normal").array.every(Number.isFinite));
grassGeometry.dispose();
globalThis.window = { innerWidth: 1440 };
for (const matrix of [createQrMatrix("https://example.com/memory-tree-test"), { size: 177, modules: Array.from({ length: 177 }, (_, r) => Array.from({ length: 177 }, (_, c) => (r + c) % 3 !== 0)) }]) {
  const entries = createGrowthCells(matrix, "tree");
  const crowns = createTieredCanopy(entries, matrix.size);
  const canopyCells = entries.filter((entry) => entry.canopy);
  assert.equal(new Set(crowns.map((entry) => `${entry.x},${entry.z}`)).size, canopyCells.length, "Every original canopy cell remains covered");
  for (const crown of crowns) {
    assert(matrix.modules[crown.z + (matrix.size - 1) / 2][crown.x + (matrix.size - 1) / 2], "Tier tops only occupy original dark cells");
    assert(crown.height <= matrix.size * 0.72 + 0.35);
  }
  assert(Math.max(...crowns.map((entry) => entry.height)) > matrix.size * 0.68, "Tree reaches approximately 1.8× original height");
  assert(crowns.some((entry) => entry.height < matrix.size * 0.44));
  assert(crowns.some((entry) => entry.height > matrix.size * 0.53 && entry.height < matrix.size * 0.59));
  for (const width of [390, 1440]) {
    window.innerWidth = width;
    const blades = createGrassBlades(entries, matrix.size);
    assert(blades.some((blade) => blade.splayed));
    for (const blade of blades) {
      assert(blade.height >= 0.58 && blade.height <= 1.55, "Meadow grass stays much lower than the old 1.99–4.85 range");
      if (blade.role === "protected") assert(!blade.splayed, "Finder and alignment structures cannot splay");
      // Root offset .20 + max core wind .16/.08 + blade radius .06 < half a cell.
      assert(Math.abs(blade.x - Math.round(blade.x)) + 0.16 + 0.06 < 0.5);
      assert(Math.abs(blade.z - Math.round(blade.z)) + 0.08 + 0.06 < 0.5);
    }
    for (const season of ["spring", "summer", "autumn", "winter"]) {
      const palette = getScenePalette("tree", season, "day", "#e09a35", "#e8d0a0");
      const leaves = buildFallingLeaves(crowns, palette, matrix.size);
      assert.equal(leaves.count, matrix.size > 105 ? 40 : width <= 720 ? 60 : 120);
      for (const time of [0, 0.25, 8, 20, 500]) {
        animateFallingLeaves(leaves, time, matrix.size);
        assert(leaves.instanceMatrix.array.every(Number.isFinite));
        assert(leaves.geometry.getAttribute("leafOpacity").array.every((value) => value >= 0 && value <= 1));
      }
      leaves.geometry.dispose(); leaves.material.dispose();
    }
  }
  console.log(`Nature invariants passed: ${matrix.size}×${matrix.size}, 3 canopy tiers, cell-safe cores, 4 seasons, mobile/desktop leaf budgets`);
}
