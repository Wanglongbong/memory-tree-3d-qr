import * as THREE from "three";
import type { SceneKind, Season, TimeOfDay } from "./project";
import type { QrVisualRole } from "./qr";

export type ScenePalette = {
  floor: string;
  showcaseFloor: string;
  modules: Record<QrVisualRole, string>;
  trunk: string;
  glow: string;
  nature?: TreeNaturePalette;
};

export type TreeNaturePalette = {
  grass: readonly [string, string, string];
  leaves: readonly [string, string, string, string];
  shadow: string;
  effect: string;
};

export type TreeSeasonSuggestion = {
  accent: string;
  floor: string;
  nature: TreeNaturePalette;
};

const treeSeasonSuggestions: Record<Season, TreeSeasonSuggestion> = {
  spring: {
    accent: "#d98fa9", floor: "#e7edc7",
    nature: { grass: ["#4f7c3e", "#6f9b4b", "#95ba60"], leaves: ["#3f7139", "#659348", "#8fb45a", "#b7d477"], shadow: "#48613a", effect: "#f2b7c6" },
  },
  summer: {
    accent: "#d8cc63", floor: "#cbe0a6",
    nature: { grass: ["#315f3a", "#467b45", "#64964f"], leaves: ["#245737", "#397044", "#52884c", "#78a65c"], shadow: "#31523a", effect: "#e6d86b" },
  },
  autumn: {
    accent: "#e09a35", floor: "#f0d49a",
    nature: { grass: ["#7c5727", "#9a6a2a", "#b47e31"], leaves: ["#8e4d22", "#b56524", "#d3812c", "#e6ae42"], shadow: "#6a4b26", effect: "#e49a32" },
  },
  winter: {
    accent: "#c8dbe0", floor: "#dfebe9",
    nature: { grass: ["#5b7168", "#748a80", "#94a69e"], leaves: ["#49645a", "#687f74", "#8fa299", "#b7c7c0"], shadow: "#52655d", effect: "#edf6f3" },
  },
};

export function getTreeSeasonSuggestion(season: Season) { return treeSeasonSuggestions[season]; }

const seasonalFloor: Record<SceneKind, Record<Season, string>> = {
  tree: { spring: "#e7edc7", summer: "#cbe0a6", autumn: "#f0d49a", winter: "#dfebe9" },
  lantern: { spring: "#f0c6a7", summer: "#e6d39a", autumn: "#edc28c", winter: "#d9ddd2" },
  koi: { spring: "#c5dcce", summer: "#a9d9d5", autumn: "#c8d4b4", winter: "#cadfe2" },
};

const roleBases: Record<SceneKind, Record<QrVisualRole, string>> = {
  tree: { protected: "#23452f", canopy: "#4d642f", roots: "#633b2b", landscape: "#73502d" },
  lantern: { protected: "#54241f", canopy: "#7a2f25", roots: "#66401f", landscape: "#815022" },
  koi: { protected: "#173d48", canopy: "#71352f", roots: "#294c66", landscape: "#235d57" },
};

const treeSeasonBases: Record<Season, Record<QrVisualRole, string>> = {
  spring: { protected: "#244b32", canopy: "#356239", roots: "#4a6534", landscape: "#5b5b2f" },
  summer: { protected: "#17452f", canopy: "#285b36", roots: "#3b642f", landscape: "#4b5a29" },
  autumn: { protected: "#4b311d", canopy: "#6a3f1e", roots: "#73501f", landscape: "#5e5525" },
  winter: { protected: "#29443d", canopy: "#3b5b50", roots: "#4d6257", landscape: "#52645d" },
};

export function getScenePalette(scene: SceneKind, season: Season, time: TimeOfDay, accentHex: string, floorHex?: string): ScenePalette {
  const floor = ensureLightFloor(new THREE.Color(isHexColor(floorHex ?? "") ? floorHex! : seasonalFloor[scene][season]));
  const accent = new THREE.Color(isHexColor(accentHex) ? accentHex : "#d99b3d");
  const bases = scene === "tree" ? treeSeasonBases[season] : roleBases[scene];
  const modules = Object.fromEntries((Object.keys(bases) as QrVisualRole[]).map((role, index) => {
    const base = new THREE.Color(bases[role]);
    if (role !== "protected") base.lerp(accent, scene === "tree" ? 0.025 + index * 0.008 : 0.08 + index * 0.018);
    return [role, `#${ensureContrast(base, floor, 4.5).getHexString()}`];
  })) as Record<QrVisualRole, string>;
  const showFloor = floor.clone().lerp(new THREE.Color(scene === "koi" ? "#17373c" : "#2b2118"), time === "night" ? 0.55 : 0.2);
  return {
    floor: `#${floor.getHexString()}`,
    showcaseFloor: `#${showFloor.getHexString()}`,
    modules,
    trunk: scene === "tree" ? "#603c2c" : scene === "lantern" ? "#4d3225" : "#315f5c",
    glow: `#${accent.getHexString()}`,
    nature: scene === "tree" ? treeSeasonSuggestions[season].nature : undefined,
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
