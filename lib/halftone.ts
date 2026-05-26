/**
 * Halftone for receipt sign-off marks.
 * Photos: gooey soft blobs (4px pitch). Drawings: crisp dots (5px, ink-only).
 */

/** Display size on the receipt (CSS scales this down from render size). */
export const MOOD_PHOTO_W = 240;
export const MOOD_PHOTO_H = 160;
/** Render at 2× so dots stay sharp when the receipt scales the image. */
export const MOOD_PHOTO_RENDER_SCALE = 2;

export const MOOD_PHOTO_RENDER_W = MOOD_PHOTO_W * MOOD_PHOTO_RENDER_SCALE;
export const MOOD_PHOTO_RENDER_H = MOOD_PHOTO_H * MOOD_PHOTO_RENDER_SCALE;

/** Matches sign-off draw canvas background (#B8B8B8). */
export const DRAW_CANVAS_BG = "#B8B8B8";

const PHOTO_CELL_SIZE = 4;
const DRAW_CELL_SIZE = 5;
const DRAW_MAX_DOT_FILL = 0.52;

/** Minimum ink signal in a cell before a dot is placed (inkOnly mode). */
const INK_ONLY_THRESHOLD = 0.06;

/** Photo gooey halftone tuning. */
const PHOTO_LUM_CONTRAST = 1.48;
const PHOTO_LUM_PIVOT = 0.45;
const PHOTO_DETAIL_BLEND = 0.52;
const PHOTO_EXPOSURE = 0.02;
const PHOTO_SHARPEN = 0.4;
/** Min ink*falloff at a pixel before it prints black (max-blend gooey). */
const GOOEY_THRESHOLD = 0.52;
/** Splat radius relative to cell — keep overlap modest so tones stay balanced. */
const GOOEY_RADIUS_SCALE = 1.02;
const GOOEY_SIGMA_RATIO = 0.58;
/** Push midtones lighter before splatting. */
const GOOEY_INK_GAMMA = 1.35;

export type HalftoneOptions = {
  /** Only halftone drawn marks — empty canvas stays clean white. */
  inkOnly?: boolean;
  /** Background luminance for inkOnly mode (0..1). */
  paperLum?: number;
};

function pixelLuminance(data: Uint8ClampedArray, i: number): number {
  return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
}

function hexLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

const DEFAULT_PAPER_LUM = hexLuminance(DRAW_CANVAS_BG);

function applyPhotoContrast(raw: number): number {
  return Math.min(
    1,
    Math.max(0, (raw - PHOTO_LUM_PIVOT) * PHOTO_LUM_CONTRAST + PHOTO_LUM_PIVOT),
  );
}

function samplePhotoLuminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  size: number,
): number {
  const x1 = Math.min(x0 + size, width);
  const y1 = Math.min(y0 + size, height);
  let sum = 0;
  let min = 1;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const lum = pixelLuminance(data, (y * width + x) * 4);
      sum += lum;
      if (lum < min) min = lum;
      count++;
    }
  }

  if (count === 0) return 1;
  const blended = min * PHOTO_DETAIL_BLEND + (sum / count) * (1 - PHOTO_DETAIL_BLEND);
  return applyPhotoContrast(blended);
}

function sharpenForHalftone(img: ImageData, amount: number): void {
  const { width: w, height: h, data } = img;
  if (w < 3 || h < 3) return;

  const lums = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lums[i] = pixelLuminance(data, i * 4);
  }

  const out = new Float32Array(lums);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const neighbors = (lums[i - 1] + lums[i + 1] + lums[i - w] + lums[i + w]) / 4;
      out[i] = Math.min(1, Math.max(0, lums[i] + amount * (lums[i] - neighbors)));
    }
  }

  for (let i = 0; i < w * h; i++) {
    const v = Math.round(out[i] * 255);
    const p = i * 4;
    data[p] = v;
    data[p + 1] = v;
    data[p + 2] = v;
  }
}

function samplePeakInk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  size: number,
  paperLum: number,
): number {
  const x1 = Math.min(x0 + size, width);
  const y1 = Math.min(y0 + size, height);
  let peak = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const lum = pixelLuminance(data, (y * width + x) * 4);
      if (lum >= paperLum - 0.025) continue;
      const ink = (paperLum - lum) / paperLum;
      if (ink > peak) peak = ink;
    }
  }

  return peak;
}

function splatGooeyInk(
  field: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
): void {
  const span = Math.ceil(radius * 2.2);
  const sigma = radius * GOOEY_SIGMA_RATIO;
  const denom = 2 * sigma * sigma;

  const y0 = Math.max(0, Math.floor(cy - span));
  const y1 = Math.min(height, Math.ceil(cy + span));
  const x0 = Math.max(0, Math.floor(cx - span));
  const x1 = Math.min(width, Math.ceil(cx + span));

  for (let y = y0; y < y1; y++) {
    const dy = y - cy;
    for (let x = x0; x < x1; x++) {
      const dx = x - cx;
      const g = Math.exp(-(dx * dx + dy * dy) / denom);
      const v = strength * g;
      const idx = y * width + x;
      if (v > field[idx]) field[idx] = v;
    }
  }
}

function renderGooeyPhotoHalftone(
  data: Uint8ClampedArray,
  outW: number,
  outH: number,
  output: Uint8ClampedArray,
): void {
  const field = new Float32Array(outW * outH);

  for (let cy = 0; cy < outH; cy += PHOTO_CELL_SIZE) {
    for (let cx = 0; cx < outW; cx += PHOTO_CELL_SIZE) {
      const lum = samplePhotoLuminance(data, outW, outH, cx, cy, PHOTO_CELL_SIZE);
      const rawInk = Math.min(1, Math.max(0, 1 - lum + PHOTO_EXPOSURE));
      if (rawInk <= 0.06) continue;
      const ink = Math.pow(rawInk, GOOEY_INK_GAMMA);

      const centerX = cx + PHOTO_CELL_SIZE / 2;
      const centerY = cy + PHOTO_CELL_SIZE / 2;
      const radius = PHOTO_CELL_SIZE * GOOEY_RADIUS_SCALE * (0.4 + 0.6 * Math.sqrt(ink));
      splatGooeyInk(field, outW, outH, centerX, centerY, radius, ink);
    }
  }

  for (let i = 0; i < outW * outH; i++) {
    const v = field[i] >= GOOEY_THRESHOLD ? 0 : 255;
    const p = i * 4;
    output[p] = v;
    output[p + 1] = v;
    output[p + 2] = v;
    output[p + 3] = 255;
  }
}

function renderCrispDrawHalftone(
  ctx: CanvasRenderingContext2D,
  data: Uint8ClampedArray,
  outW: number,
  outH: number,
  paperLum: number,
): void {
  const maxRadius = DRAW_CELL_SIZE * DRAW_MAX_DOT_FILL;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, outW, outH);
  ctx.fillStyle = "#1A1A1A";

  for (let cy = 0; cy < outH; cy += DRAW_CELL_SIZE) {
    for (let cx = 0; cx < outW; cx += DRAW_CELL_SIZE) {
      const ink = samplePeakInk(data, outW, outH, cx, cy, DRAW_CELL_SIZE, paperLum);
      if (ink <= INK_ONLY_THRESHOLD) continue;

      const radius = maxRadius * Math.sqrt(ink);
      ctx.beginPath();
      ctx.arc(cx + DRAW_CELL_SIZE / 2, cy + DRAW_CELL_SIZE / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function rasterizeSource(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  outW: number,
  outH: number,
): ImageData | null {
  const tmp = document.createElement("canvas");
  tmp.width = outW;
  tmp.height = outH;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const srcW =
    (source as HTMLVideoElement).videoWidth ??
    (source as HTMLImageElement).naturalWidth ??
    (source as HTMLCanvasElement).width;
  const srcH =
    (source as HTMLVideoElement).videoHeight ??
    (source as HTMLImageElement).naturalHeight ??
    (source as HTMLCanvasElement).height;

  if (!srcW || !srcH) return null;

  const srcAspect = srcW / srcH;
  const dstAspect = outW / outH;
  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;
  if (srcAspect > dstAspect) {
    sw = srcH * dstAspect;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / dstAspect;
    sy = (srcH - sh) / 2;
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
  return ctx.getImageData(0, 0, outW, outH);
}

/**
 * Reads from `source`, returns a canvas of size `outW × outH` halftoned for receipt print.
 */
export function halftone(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  outW: number = MOOD_PHOTO_RENDER_W,
  outH: number = MOOD_PHOTO_RENDER_H,
  options: HalftoneOptions = {},
): HTMLCanvasElement {
  const { inkOnly = false, paperLum = DEFAULT_PAPER_LUM } = options;

  const dst = document.createElement("canvas");
  dst.width = outW;
  dst.height = outH;
  const ctx = dst.getContext("2d");
  if (!ctx) return dst;

  const img = rasterizeSource(source, outW, outH);
  if (!img) return dst;

  if (inkOnly) {
    renderCrispDrawHalftone(ctx, img.data, outW, outH, paperLum);
    return dst;
  }

  sharpenForHalftone(img, PHOTO_SHARPEN);
  const out = ctx.createImageData(outW, outH);
  renderGooeyPhotoHalftone(img.data, outW, outH, out.data);
  ctx.putImageData(out, 0, 0);

  return dst;
}
