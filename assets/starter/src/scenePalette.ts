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

const treeSeasonBases: Record<Season, Record<QrVisualRole, string>> = {
  spring: { protected: "#214b32", canopy: "#3f642f", roots: "#4f5b29", landscape: "#5b4c28" },
  summer: { protected: "#17452f", canopy: "#315d2c", roots: "#465b24", landscape: "#514826" },
  autumn: { protected: "#52351f", canopy: "#77431f", roots: "#5f3d22", landscape: "#765322" },
  winter: { protected: "#24433a", canopy: "#36584a", roots: "#4e4d37", landscape: "#4a5834" },
};

export function getScenePalette(scene: SceneKind, season: Season, time: TimeOfDay, accentHex: string, floorHex?: string): ScenePalette {
  const floor = ensureLightFloor(new THREE.Color(isHexColor(floorHex ?? "") ? floorHex! : seasonalFloor[scene][season]));
  const accent = new THREE.Color(isHexColor(accentHex) ? accentHex : "#d99b3d");
  const bases = scene === "tree" ? treeSeasonBases[season] : roleBases[scene];
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
    const backgroundLuminance = luminance(background); const resultLuminance = luminance(result);
    const ratio = (Math.max(backgroundLuminance, resultLuminance) + 0.05) / (Math.min(backgroundLuminance, resultLuminance) + 0.05);
    if (ratio >= minimum) break;
    lightness = Math.max(0.06, lightness - 0.018);
  }
  return result;
}

function ensureLightFloor(color: THREE.Color) {
  const result = color.clone(); const hsl = { h: 0, s: 0, l: 0 }; result.getHSL(hsl);
  while (luminance(result) < 0.58 && hsl.l < 0.92) { hsl.l += 0.025; result.setHSL(hsl.h, hsl.s, hsl.l); }
  return result;
}

function luminance(color: THREE.Color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function isHexColor(value: string) { return /^#[0-9a-f]{6}$/i.test(value); }
