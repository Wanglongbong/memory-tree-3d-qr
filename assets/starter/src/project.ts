export type SceneKind = "tree" | "lantern" | "koi";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type TimeOfDay = "day" | "night";
export type ProjectSource = "upload" | "vietqr" | "text";

export type MemoryProject = {
  version: 1;
  payload: string;
  source: ProjectSource;
  scene: SceneKind;
  season: Season;
  time: TimeOfDay;
  palette: string;
  accent: string;
  title: string;
  message: string;
};

export function saveProjectToHash(project: MemoryProject) {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(project)));
  const url = new URL(window.location.href);
  url.hash = `p=${encoded}`;
  history.replaceState(null, "", url);
  return url.toString();
}

export function loadProjectFromHash(): MemoryProject | null {
  const encoded = new URLSearchParams(window.location.hash.slice(1)).get("p");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as Partial<MemoryProject>;
    if (parsed.version !== 1 || typeof parsed.payload !== "string" || parsed.payload.length === 0 || parsed.payload.length > 4096) return null;
    if (!["tree", "lantern", "koi"].includes(parsed.scene ?? "")) return null;
    if (!["spring", "summer", "autumn", "winter"].includes(parsed.season ?? "")) return null;
    return parsed as MemoryProject;
  } catch { return null; }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
