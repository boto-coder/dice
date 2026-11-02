import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import { faceNormal, type PolyhedronData } from '../physics/polyhedra';
import { SHUFFLED_LABEL_SHAPES } from '../physics/world';
import { atlasLayout, atlasPixel, faceUVs, inradius, type AtlasLayout, type UV } from './faceUV';

export const FACE_STYLE = {
  background: '#fbfbf8',
  ink: '#1f2328',
  fontFamily: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'`,
  fontWeight: 600,
} as const;

const ROTATED_DIGIT: Readonly<Record<string, string>> = {
  '0': '0',
  '1': '1',
  '6': '9',
  '8': '8',
  '9': '6',
};

/**
 * True when a label reads as a different number upside down (6/9, 16/91,
 * 68/89, …). Such labels get an underline, like on real dice.
 */
export function needsUnderline(label: string): boolean {
  if (!/^\d+$/.test(label)) return false;
  if ([...label].some((ch) => !(ch in ROTATED_DIGIT))) return false;
  const rotated = [...label]
    .reverse()
    .map((ch) => ROTATED_DIGIT[ch])
    .join('');
  return rotated !== label && !rotated.startsWith('0');
}

/** Everything needed to texture one die: the atlas and per-face UVs. */
export interface DieAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly layout: AtlasLayout;
  /** Cell-local UVs per face polygon vertex. */
  readonly faceUVs: readonly (readonly UV[])[];
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  rotation = 0,
): void {
  if (label === '') return;
  let px = size;
  ctx.font = `${FACE_STYLE.fontWeight} ${px}px ${FACE_STYLE.fontFamily}`;
  const width = ctx.measureText(label).width;
  if (width > maxWidth) {
    px *= maxWidth / width;
    ctx.font = `${FACE_STYLE.fontWeight} ${px}px ${FACE_STYLE.fontFamily}`;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = FACE_STYLE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);
  if (needsUnderline(label)) {
    const w = Math.min(ctx.measureText(label).width, px * 0.9);
    ctx.fillRect(-w / 2, px * 0.42, w, Math.max(1, px * 0.07));
  }
  ctx.restore();
}

const cache = new Map<string, DieAtlas>();

/** Builds (or reuses) the texture atlas holding every face label of a die. */
export function dieAtlas(die: DieDefinition, data: PolyhedronData): DieAtlas {
  const key = `${die.shape}|${die.faces.map((f) => f.label).join('\u0000')}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const layout = atlasLayout(data.faces.length);
  const uvs = data.faces.map((face, fi) =>
    faceUVs(
      face.map((vi) => data.vertices[vi]!),
      faceNormal(data, fi),
      data.labelAlign,
    ),
  );

  const canvas = document.createElement('canvas');
  canvas.width = layout.columns * layout.cell;
  canvas.height = layout.rows * layout.cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  ctx.fillStyle = FACE_STYLE.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const span = layout.cell * (1 - 2 * layout.pad);
  // Shuffled dice may show any label on any face, so every label must fit the smallest face.
  const uniformR = SHUFFLED_LABEL_SHAPES.has(die.shape)
    ? Math.min(...uvs.map((faceUv) => inradius(faceUv))) * span
    : null;
  data.faces.forEach((face, fi) => {
    const faceUv = uvs[fi]!;
    const [cx, cy] = atlasPixel(layout, fi, [0.5, 0.5]);
    const r = uniformR ?? inradius(faceUv) * span;
    if (data.readBy === 'vertex') {
      // d4 style: each corner of the face shows that corner's number, pointing at it.
      face.forEach((vi, k) => {
        const [px, py] = atlasPixel(layout, fi, faceUv[k]!);
        const dx = px - cx;
        const dy = py - cy;
        drawLabel(
          ctx,
          die.faces[vi]!.label,
          cx + dx * 0.52,
          cy + dy * 0.52,
          r * 0.75,
          r * 1.1,
          Math.atan2(dx, -dy),
        );
      });
    } else {
      drawLabel(ctx, die.faces[fi]!.label, cx, cy, r * 1.15, r * 1.6);
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const atlas: DieAtlas = { texture, layout, faceUVs: uvs };
  cache.set(key, atlas);
  return atlas;
}
