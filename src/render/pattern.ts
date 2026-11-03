import { mix } from '../core/colour';
import type { DiceStyle } from '../core/diceStyle';
import { seededRng, type Rng } from '../core/random';

/** A square area of the texture (one face of the die), in canvas pixels. */
export interface Cell {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** One drawing step of a pattern, in canvas pixels. */
export type PatternShape =
  | { readonly kind: 'fill'; readonly colour: string }
  | {
      readonly kind: 'gradient';
      readonly cell: Cell;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly kind: 'dot';
      /** The face the shape belongs to; drawing is clipped to it. */
      readonly cell: Cell;
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly colour: string;
      readonly alpha: number;
    }
  | {
      readonly kind: 'line';
      readonly cell: Cell;
      readonly points: readonly (readonly [number, number])[];
      readonly width: number;
      readonly colour: string;
      readonly alpha: number;
    };

/** A small stable hash, so the same style always gets the same marble/speckles. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function marble(style: DiceStyle, cells: readonly Cell[], rng: Rng): PatternShape[] {
  const shapes: PatternShape[] = [];
  for (const cell of cells) {
    for (let v = 0; v < 3; v++) {
      // A vein: a wandering line across the face.
      let x = cell.x + rng() * cell.size;
      let y = cell.y;
      let heading = Math.PI / 2 + (rng() - 0.5) * 1.2;
      const points: [number, number][] = [[x, y]];
      const step = cell.size / 12;
      for (let i = 0; i < 16; i++) {
        heading += (rng() - 0.5) * 0.9;
        x += Math.cos(heading) * step;
        y += Math.sin(heading) * step;
        points.push([x, y]);
      }
      shapes.push({
        kind: 'line',
        cell,
        points,
        width: cell.size * (0.012 + rng() * 0.035),
        colour: style.accent,
        alpha: 0.35 + rng() * 0.4,
      });
    }
  }
  return shapes;
}

function speckled(style: DiceStyle, cells: readonly Cell[], rng: Rng): PatternShape[] {
  const dark = mix(style.body, '#000000', 0.45);
  const shapes: PatternShape[] = [];
  for (const cell of cells) {
    for (let i = 0; i < 55; i++) {
      shapes.push({
        kind: 'dot',
        cell,
        x: cell.x + rng() * cell.size,
        y: cell.y + rng() * cell.size,
        r: cell.size * (0.004 + rng() * 0.012),
        colour: rng() < 0.7 ? style.accent : dark,
        alpha: 0.55 + rng() * 0.4,
      });
    }
  }
  return shapes;
}

function swirl(style: DiceStyle, cells: readonly Cell[], rng: Rng): PatternShape[] {
  return cells.map((cell) => {
    const cx = cell.x + cell.size / 2;
    const cy = cell.y + cell.size / 2;
    const start = rng() * Math.PI * 2;
    const points: [number, number][] = [];
    // An Archimedean spiral filling the face, with two arms' worth of turns.
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const angle = start + t * Math.PI * 6;
      const r = t * cell.size * 0.62;
      points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
    return {
      kind: 'line',
      cell,
      points,
      width: cell.size * 0.09,
      colour: style.accent,
      alpha: 1,
    };
  });
}

function stripes(style: DiceStyle, cells: readonly Cell[]): PatternShape[] {
  const shapes: PatternShape[] = [];
  for (const cell of cells) {
    const gap = cell.size / 5;
    // Diagonal lines (45°) across the face, overlapping its edges.
    for (let k = -cell.size; k <= cell.size; k += gap) {
      shapes.push({
        kind: 'line',
        cell,
        points: [
          [cell.x + k, cell.y],
          [cell.x + k + cell.size, cell.y + cell.size],
        ],
        width: gap / 2,
        colour: style.accent,
        alpha: 1,
      });
    }
  }
  return shapes;
}

/**
 * The drawing steps for a style's pattern over the given faces. Deterministic:
 * the same style always gives the same pattern.
 */
export function planPattern(style: DiceStyle, cells: readonly Cell[]): PatternShape[] {
  const base: PatternShape = { kind: 'fill', colour: style.body };
  const rng = seededRng(hashString(`${style.body}${style.accent}${style.pattern}`));
  switch (style.pattern) {
    case 'solid':
      return [base];
    case 'gradient':
      return [
        base,
        ...cells.map((cell): PatternShape => ({
          kind: 'gradient',
          cell,
          from: style.body,
          to: style.accent,
        })),
      ];
    case 'marble':
      return [base, ...marble(style, cells, rng)];
    case 'speckled':
      return [base, ...speckled(style, cells, rng)];
    case 'swirl':
      return [base, ...swirl(style, cells, rng)];
    case 'stripes':
      return [base, ...stripes(style, cells)];
  }
}

/** Draws pattern steps on a canvas. Each face is clipped so patterns stay inside it. */
export function drawPattern(
  ctx: CanvasRenderingContext2D,
  shapes: readonly PatternShape[],
  width: number,
  height: number,
): void {
  for (const shape of shapes) {
    ctx.save();
    if (shape.kind !== 'fill') {
      const { x, y, size } = shape.cell;
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
    }
    switch (shape.kind) {
      case 'fill':
        ctx.fillStyle = shape.colour;
        ctx.fillRect(0, 0, width, height);
        break;
      case 'gradient': {
        const { x, y, size } = shape.cell;
        const g = ctx.createLinearGradient(x, y, x + size, y + size);
        g.addColorStop(0, shape.from);
        g.addColorStop(1, shape.to);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, size, size);
        break;
      }
      case 'dot':
        ctx.globalAlpha = shape.alpha;
        ctx.fillStyle = shape.colour;
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'line': {
        ctx.globalAlpha = shape.alpha;
        ctx.strokeStyle = shape.colour;
        ctx.lineWidth = shape.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const [first, ...rest] = shape.points;
        ctx.moveTo(first![0], first![1]);
        for (const [px, py] of rest) ctx.lineTo(px, py);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
}
