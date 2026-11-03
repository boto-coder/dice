import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import { faceNormal, type PolyhedronData } from '../physics/polyhedra';
import { SHUFFLED_LABEL_SHAPES } from '../physics/world';
import { DEFAULT_STYLE, labelColour, styleKey, type DiceStyle } from '../core/diceStyle';
import { atlasLayout, atlasPixel, faceUVs, inradius, type AtlasLayout, type UV } from './faceUV';
import { drawPattern, planPattern, type Cell } from './pattern';

export const FACE_STYLE = {
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

/** How labels are drawn: their colour, and an optional halo that separates them from a pattern. */
interface Ink {
  readonly colour: string;
  readonly halo: string | null;
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  ink: Ink,
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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (ink.halo) {
    ctx.strokeStyle = ink.halo;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = px * 0.14;
    ctx.lineJoin = 'round';
    ctx.strokeText(label, 0, 0);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ink.colour;
  ctx.fillText(label, 0, 0);
  if (needsUnderline(label)) {
    const w = Math.min(ctx.measureText(label).width, px * 0.9);
    ctx.fillRect(-w / 2, px * 0.42, w, Math.max(1, px * 0.07));
  }
  ctx.restore();
}

/**
 * Atlases are cached per die and style. Trying out many colours would grow the
 * cache without end, so only the most recently used ones are kept; an evicted
 * texture is freed and simply re-uploaded if a die on the table still uses it.
 */
export const MAX_CACHED_ATLASES = 48;
const cache = new Map<string, DieAtlas>();
const evictionListeners = new Set<(texture: THREE.Texture) => void>();

/** Calls `listener` with each texture dropped from the cache (e.g. to drop its materials). */
export function onAtlasEvicted(listener: (texture: THREE.Texture) => void): void {
  evictionListeners.add(listener);
}

/** Number of atlases currently cached (for tests). */
export function cachedAtlasCount(): number {
  return cache.size;
}

function remember(key: string, atlas: DieAtlas): void {
  cache.set(key, atlas);
  while (cache.size > MAX_CACHED_ATLASES) {
    const [oldestKey, oldest] = cache.entries().next().value!;
    cache.delete(oldestKey);
    oldest.texture.dispose();
    for (const listener of evictionListeners) listener(oldest.texture);
  }
}

/** The square area of atlas cell `index`, in canvas pixels. */
export function atlasCell(layout: AtlasLayout, index: number): Cell {
  return {
    x: (index % layout.columns) * layout.cell,
    y: Math.floor(index / layout.columns) * layout.cell,
    size: layout.cell,
  };
}

/** Builds (or reuses) the texture atlas holding every face of a die in a style. */
export function dieAtlas(
  die: DieDefinition,
  data: PolyhedronData,
  style: DiceStyle = DEFAULT_STYLE,
): DieAtlas {
  const key = `${die.shape}|${styleKey(style)}|${die.faces.map((f) => f.label).join('\u0000')}`;
  const cached = cache.get(key);
  if (cached) {
    // Mark as most recently used.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

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
  const cells = data.faces.map((_, fi) => atlasCell(layout, fi));
  drawPattern(ctx, planPattern(style, cells), canvas.width, canvas.height);
  // On patterns, a halo in the body colour keeps labels readable over veins and stripes.
  const ink: Ink = {
    colour: labelColour(style),
    halo: style.pattern === 'solid' ? null : style.body,
  };

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
          ink,
          die.faces[vi]!.label,
          cx + dx * 0.52,
          cy + dy * 0.52,
          r * 0.75,
          r * 1.1,
          Math.atan2(dx, -dy),
        );
      });
    } else {
      drawLabel(ctx, ink, die.faces[fi]!.label, cx, cy, r * 1.15, r * 1.6);
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const atlas: DieAtlas = { texture, layout, faceUVs: uvs };
  remember(key, atlas);
  return atlas;
}
