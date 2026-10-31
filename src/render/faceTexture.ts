import * as THREE from 'three';

export const FACE_STYLE = {
  size: 256,
  background: '#fbfbf8',
  ink: '#1f2328',
  font: `600 {px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'`,
  /** Max fraction of the texture width the label may take. */
  maxWidth: 0.62,
  /** Font size as a fraction of the texture size, before shrinking to fit. */
  fontScale: 0.5,
} as const;

/** 6 and 9 look alike when rotated; they get an underline like on real dice. */
export function needsUnderline(label: string): boolean {
  return label === '6' || label === '9';
}

/** Draws one face label centred on a square canvas. */
export function drawFace(ctx: CanvasRenderingContext2D, label: string): void {
  const { size, background, ink } = FACE_STYLE;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);
  if (label === '') return;

  let px = size * FACE_STYLE.fontScale;
  ctx.font = FACE_STYLE.font.replace('{px}', String(px));
  const width = ctx.measureText(label).width;
  const maxWidth = size * FACE_STYLE.maxWidth;
  if (width > maxWidth) {
    px *= maxWidth / width;
    ctx.font = FACE_STYLE.font.replace('{px}', String(px));
  }
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2);

  if (needsUnderline(label)) {
    const w = px * 0.45;
    ctx.fillRect(size / 2 - w / 2, size / 2 + px * 0.42, w, px * 0.07);
  }
}

const cache = new Map<string, THREE.CanvasTexture>();

/** Cached texture for a face label (shared between dice with the same label). */
export function faceTexture(label: string): THREE.CanvasTexture {
  const cached = cache.get(label);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FACE_STYLE.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  drawFace(ctx, label);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(label, texture);
  return texture;
}
