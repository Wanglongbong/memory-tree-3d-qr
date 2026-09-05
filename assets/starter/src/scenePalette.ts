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
  effectLabel: string;
  nature: TreeNaturePalette;
};

const treeSeasonSuggestions: Record<Season, TreeSeasonSuggestion> = {
  spring: {
    accent: "#d98fa9", floor: "#e8d0a0", effectLabel: "Cánh hoa bay",
    nature: { grass: ["#4b652b", "#627d34", "#809346"], leaves: ["#28664b", "#3e7b56", "#5e9367", "#86aa77"], shadow: "#747477", effect: "#f2b7c6" },
  },
  summer: {
    accent: "#d8cc63", floor: "#e8d0a0", effectLabel: "Đom đóm",
    nature: { grass: ["#456b30", "#5d8039", "#7a9648"], leaves: ["#20513f", "#31674d", "#497d58", "#70966a"], shadow: "#747477", effect: "#e6d86b" },
  },
  autumn: {
    accent: "#e09a35", floor: "#e8d0a0", effectLabel: "Lá rơi",
    nature: { grass: ["#80702c", "#a18c42", "#c6ae64"], leaves: ["#98501f", "#b66b27", "#d38b32", "#e5ad50"], shadow: "#747477", effect: "#e49a32" },
  },
  winter: {
    accent: "#c8dbe0", floor: "#e8d0a0", effectLabel: "Tuyết nhẹ",
    nature: { grass: ["#375d76", "#527b92", "#86aab7"], leaves: ["#235449", "#326b5d", "#56887c", "#a4beb8"], shadow: "#747477", effect: "#edf6f3" },
  },
};

export function getTreeSeasonSuggestion(season: Season) { return treeSeasonSuggestions[season]; }

const seasonalFloor: Record<SceneKind, Record<Season, string>> = {
  tree: { spring: "#e8d0a0", summer: "#e8d0a0", autumn: "#e8d0a0", winter: "#e8d0a0" },
  lantern: { spring: "#f0c6a7", summer: "#e6d39a", autumn: "#edc28c", winter: "#d9ddd2" },
  koi: { spring: "#c5dcce", summer: "#a9d9d5", autumn: "#c8d4b4", winter: "#cadfe2" },
};

const roleBases: Record<SceneKind, Record<QrVisualRole, string>> = {
  tree: { protected: "#23452f", canopy: "#4d642f", roots: "#633b2b", landscape: "#73502d" },
  lantern: { protected: "#54241f", canopy: "#7a2f25", roots: "#66401f", landscape: "#815022" },
  koi: { protected: "#173d48", canopy: "#71352f", roots: "#294c66", landscape: "#235d57" },
};

const treeSeasonBases: Record<Season, Record<QrVisualRole, string>> = {
  spring: { protected: "#405725", canopy: "#28664b", roots: "#4b652b", landscape: "#4b652b" },
  summer: { protected: "#355225", canopy: "#20513f", roots: "#456b30", landscape: "#456b30" },
  autumn: { protected: "#635321", canopy: "#98501f", roots: "#80702c", landscape: "#80702c" },
  winter: { protected: "#2c4b61", canopy: "#235449", roots: "#375d76", landscape: "#375d76" },
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
    showcaseFloor: scene === "tree" ? "#856040" : `#${showFloor.getHexString()}`,
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
