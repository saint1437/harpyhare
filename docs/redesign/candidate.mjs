import { hex, inGamut } from "./palette.mjs";
const N = 40; // warm-stone neutral; the landing's cream ink is hue 39
// Cap chroma at the sRGB gamut boundary for the given L/H so the declared value
// is exactly what renders — no browser gamut-mapping.
export function fit([L, C, H]) {
  if (inGamut(L, C, H)) return [L, C, H];
  let lo = 0,
    hi = C;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (inGamut(L, m, H)) lo = m;
    else hi = m;
  }
  return [L, Math.floor(lo * 1000) / 1000, H];
}
const RAW_DARK = {
  "bg/base": [0.17, 0.005, N],
  "bg/surface": [0.215, 0.006, N],
  "bg/elevated": [0.258, 0.007, N],
  "bg/inset": [0.14, 0.005, N],
  "hud/base": [0.235, 0.005, N],
  "hud/surface": [0.285, 0.006, N],
  "hud/elevated": [0.32, 0.007, N],
  "border/subtle": [0.315, 0.006, N],
  "border/strong": [0.592, 0.01, N],
  "text/primary": [0.955, 0.006, N],
  "text/secondary": [0.79, 0.008, N],
  "text/muted": [0.695, 0.008, N],
  "text/inverse": [0.2, 0.01, N],
  "accent/primary": [0.55, 0.16, 20],
  "accent/hover": [0.495, 0.15, 20],
  "accent/subtle": [0.285, 0.055, 20],
  "accent/on": [0.98, 0.008, 30],
  "accent/indicator": [0.68, 0.15, 20],
  "state/listening": [0.775, 0.11, 200],
  "state/listening-dim": [0.6, 0.085, 200],
  "state/success": [0.715, 0.15, 150],
  "state/warning": [0.845, 0.135, 80],
  "state/danger": [0.72, 0.175, 30],
  "focus/ring": [0.75, 0.115, 232],
};
const RAW_LIGHT = {
  "bg/base": [0.955, 0.006, N],
  "bg/surface": [0.99, 0.004, N],
  "bg/elevated": [0.995, 0.003, N],
  "bg/inset": [0.925, 0.008, N],
  "hud/base": [0.968, 0.005, N],
  "hud/surface": [0.9925, 0.003, N],
  "hud/elevated": [0.995, 0.003, N],
  "border/subtle": [0.88, 0.008, N],
  "border/strong": [0.598, 0.012, N],
  "text/primary": [0.245, 0.012, N],
  "text/secondary": [0.44, 0.012, N],
  "text/muted": [0.508, 0.012, N],
  "text/inverse": [0.985, 0.004, N],
  "accent/primary": [0.475, 0.165, 20],
  "accent/hover": [0.415, 0.16, 20],
  "accent/subtle": [0.935, 0.026, 20],
  "accent/on": [0.985, 0.006, 30],
  "accent/indicator": [0.43, 0.165, 20],
  "state/listening": [0.498, 0.098, 200],
  "state/listening-dim": [0.598, 0.08, 200],
  "state/success": [0.49, 0.14, 150],
  "state/warning": [0.545, 0.12, 80],
  "state/danger": [0.48, 0.185, 30],
  "focus/ring": [0.52, 0.15, 232],
};
const fitAll = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fit(v)]));
export const DARK = fitAll(RAW_DARK);
export const LIGHT = fitAll(RAW_LIGHT);
export const H = (set) => Object.fromEntries(Object.entries(set).map(([k, v]) => [k, hex(...v)]));
