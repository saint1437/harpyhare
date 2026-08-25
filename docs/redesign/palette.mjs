// OKLCH -> sRGB, WCAG contrast, and the harpyhare palette candidate.
const M1 = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
const M2 = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
export function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180,
    a = C * Math.cos(h),
    b = C * Math.sin(h);
  const lms = M1.map((r) => r[0] * L + r[1] * a + r[2] * b).map((v) => v ** 3);
  return M2.map((r) => r[0] * lms[0] + r[1] * lms[1] + r[2] * lms[2]);
}
const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export function hex(L, C, H) {
  const v = oklchToLinear(L, C, H).map((c) => clamp01(enc(clamp01(c))));
  return (
    "#" +
    v
      .map((x) =>
        Math.round(x * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function inGamut(L, C, H) {
  return oklchToLinear(L, C, H).every((c) => c >= -0.001 && c <= 1.001);
}
const srgbToLin = (h) => {
  const n = h.replace("#", "");
  return [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
};
export const lumHex = (h) => {
  const l = srgbToLin(h);
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
export function cr(h1, h2) {
  const [a, b] = [lumHex(h1), lumHex(h2)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
}
export function over(fgHex, bgHex, alpha) {
  // CSS alpha compositing, gamma space
  const g = (h) => {
    const n = h.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  };
  const F = g(fgHex),
    B = g(bgHex),
    out = F.map((c, i) => alpha * c + (1 - alpha) * B[i]);
  return (
    "#" +
    out
      .map((x) =>
        Math.round(x * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
