import * as THREE from "three";
import type { SceneKind, Season, TimeOfDay } from "./project";
import type { QrVisualRole } from "./qr";

export type ScenePalette = {
  floor: string;
  showcaseFloor: string;
  modules: Record<QrVisualRole, string>;
  trunk: string;
  glow: string;
};

const seasonalFloor: Record<SceneKind, Record<Season, string>> = {
  tree: { spring: "#dfe8b6", summer: "#bfd79d", autumn: "#e6cc91", winter: "#dbe8e6" },
  lantern: { spring: "#f0c6a7", summer: "#e6d39a", autumn: "#edc28c", winter: "#d9ddd2" },
  koi: { spring: "#c5dcce", summer: "#a9d9d5", autumn: "#c8d4b4", winter: "#cadfe2" },
};

const roleBases: Record<SceneKind, Record<QrVisualRole, string>> = {
  tree: { protected: "#23452f", canopy: "#4d642f", roots: "#633b2b", landscape: "#73502d" },
  lantern: { protected: "#54241f", canopy: "#7a2f25", roots: "#66401f", landscape: "#815022" },
  koi: { protected: "#173d48", canopy: "#71352f", roots: "#294c66", landscape: "#235d57" },
};

export function getScenePalette(scene: SceneKind, season: Season, time: TimeOfDay, accentHex: string): ScenePalette {
  const floor = new THREE.Color(seasonalFloor[scene][season]);
  const accent = new THREE.Color(isHexColor(accentHex) ? accentHex : "#d99b3d");
  const bases = roleBases[scene];
  const modules = Object.fromEntries((Object.keys(bases) as QrVisualRole[]).map((role, index) => {
    const base = new THREE.Color(bases[role]);
    if (role !== "protected") base.lerp(accent, scene === "tree" ? 0.1 + index * 0.025 : 0.08 + index * 0.018);
    return [role, `#${ensureContrast(base, floor, 4.5).getHexString()}`];
  })) as Record<QrVisualRole, string>;
  const showFloor = floor.clone().lerp(new THREE.Color(scene === "koi" ? "#17373c" : "#2b2118"), time === "night" ? 0.55 : 0.2);
  return {
    floor: `#${floor.getHexString()}`,
    showcaseFloor: `#${showFloor.getHexString()}`,
    modules,
    trunk: scene === "tree" ? "#603c2c" : scene === "lantern" ? "#4d3225" : "#315f5c",
    glow: `#${accent.getHexString()}`,
  };
}

export function contrastRatio(foreground: string, background: string) {
  const a = luminance(new THREE.Color(foreground));
  const b = luminance(new THREE.Color(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function ensureContrast(color: THREE.Color, background: THREE.Color, minimum: number) {
  const result = color.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  result.getHSL(hsl);
  let lightness = Math.min(hsl.l, 0.34);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    result.setHSL(hsl.h, Math.max(0.38, hsl.s), lightness);
    const ratio = (luminance(background) + 0.05) / (luminance(result) + 0.05);
    if (ratio >= minimum) break;
    lightness = Math.max(0.06, lightness - 0.018);
  }
  return result;
}

function luminance(color: THREE.Color) {
  const linear = [color.r, color.g, color.b].map((component) => component <= 0.03928 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function isHexColor(value: string) { return /^#[0-9a-f]{6}$/i.test(value); }
