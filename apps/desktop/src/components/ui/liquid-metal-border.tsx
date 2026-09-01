import {
  defaultObjectSizing,
  emptyPixel,
  liquidMetalFragmentShader,
  LiquidMetalShapes,
  ShaderFitOptions,
  ShaderMount,
} from "@paper-design/shaders";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const SHADER_SPEED = 0.6;
const SHADER_MIN_PIXEL_RATIO = 1;
const FRAME_WIDTH_PX = 3;
const COLOR_BACK: [number, number, number, number] = [0, 0, 0, 0];
const COLOR_TINT: [number, number, number, number] = [0.98, 0.98, 1, 1];
const REPETITION = 4;
const SOFTNESS = 0.5;
const SHIFT_RED = 0.3;
const SHIFT_BLUE = 0.3;
const DISTORTION = 0.05;
const CONTOUR = 0.2;
const ANGLE = 45;
const WEBGL_CONTEXT: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
};

let emptyImagePromise: Promise<HTMLImageElement> | null = null;

function emptyImage(): Promise<HTMLImageElement> {
  emptyImagePromise ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve(image);
    });
    image.addEventListener("error", () => {
      // Промис не кэшируем при отказе: иначе одна неудачная загрузка гасит
      // рамку до перезапуска окна.
      emptyImagePromise = null;
      reject(new Error("liquid-metal empty pixel"));
    });
    image.src = emptyPixel;
  });
  return emptyImagePromise;
}

function sizingUniforms() {
  return {
    u_fit: ShaderFitOptions[defaultObjectSizing.fit],
    u_scale: defaultObjectSizing.scale,
    u_rotation: defaultObjectSizing.rotation,
    u_originX: defaultObjectSizing.originX,
    u_originY: defaultObjectSizing.originY,
    u_offsetX: defaultObjectSizing.offsetX,
    u_offsetY: defaultObjectSizing.offsetY,
    u_worldWidth: defaultObjectSizing.worldWidth,
    u_worldHeight: defaultObjectSizing.worldHeight,
  };
}

function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, height / 2);
  return `M${String(x + r)},${String(y)} H${String(x + width - r)} A${String(r)},${String(r)} 0 0 1 ${String(x + width)},${String(y + r)} V${String(y + height - r)} A${String(r)},${String(r)} 0 0 1 ${String(x + width - r)},${String(y + height)} H${String(x + r)} A${String(r)},${String(r)} 0 0 1 ${String(x)},${String(y + height - r)} V${String(y + r)} A${String(r)},${String(r)} 0 0 1 ${String(x + r)},${String(y)} Z`;
}

function ringMaskImage(width: number, height: number, radius: number): string {
  const stroke = FRAME_WIDTH_PX;
  const innerWidth = Math.max(0, width - stroke * 2);
  const innerHeight = Math.max(0, height - stroke * 2);
  const innerRadius = Math.max(0, radius - stroke);
  const path = `${roundedRectPath(0, 0, width, height, radius)} ${roundedRectPath(stroke, stroke, innerWidth, innerHeight, innerRadius)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><path fill="white" fill-rule="evenodd" d="${path}"/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function LiquidMetalBorder({ active }: { active: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const show = active && !reducedMotion;
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0, radius: 0 });

  useLayoutEffect(() => {
    if (!show) return;
    const frame = frameRef.current;
    if (!frame) return;
    const sync = () => {
      const rect = frame.getBoundingClientRect();
      const radius = Number.parseFloat(getComputedStyle(frame).borderTopLeftRadius);
      setBox({
        width: rect.width,
        height: rect.height,
        radius: Number.isFinite(radius) ? radius : 0,
      });
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, [show]);

  // Пересоздавать контекст на каждый кадр ресайза нельзя: ShaderMount держит
  // свой ResizeObserver и меняет размер канваса сам, а его dispose() не зовёт
  // loseContext(), поэтому брошенные WebGL-контексты копятся до GC — при
  // исчерпании лимита WebKit гасит старейший и рамка молча пропадает.
  const mounted = box.width > 0;

  useEffect(() => {
    if (!show || !mounted) return;
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let mount: ShaderMount | null = null;
    void emptyImage()
      .then((image) => {
        if (disposed || hostRef.current === null) return;
        try {
          mount = new ShaderMount(
            host,
            liquidMetalFragmentShader,
            {
              ...sizingUniforms(),
              u_image: image,
              u_isImage: false,
              u_shape: LiquidMetalShapes.none,
              u_colorBack: [...COLOR_BACK],
              u_colorTint: [...COLOR_TINT],
              u_repetition: REPETITION,
              u_softness: SOFTNESS,
              u_shiftRed: SHIFT_RED,
              u_shiftBlue: SHIFT_BLUE,
              u_distortion: DISTORTION,
              u_contour: CONTOUR,
              u_angle: ANGLE,
            },
            WEBGL_CONTEXT,
            SHADER_SPEED,
            0,
            SHADER_MIN_PIXEL_RATIO,
          );
        } catch {
          mount = null;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      mount?.dispose();
    };
  }, [show, mounted]);

  if (!show) return null;
  const maskImage = box.width > 0 ? ringMaskImage(box.width, box.height, box.radius) : undefined;
  return (
    <div ref={frameRef} className="liquid-metal-frame" aria-hidden>
      <div
        ref={hostRef}
        className="liquid-metal-frame-host"
        style={
          maskImage === undefined
            ? undefined
            : {
                WebkitMaskImage: maskImage,
                maskImage,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }
        }
      />
    </div>
  );
}
