import type { DieDefinition } from '../core/dice';
import type { Rng } from '../core/random';
import { goodnessOfFit, type GoodnessOfFit } from '../core/stats';
import { DiceWorld, type Arena } from './world';

/** One distinct result of a die: faces with the same label count as one outcome. */
export interface Outcome {
  readonly label: string;
  /** Chance of this outcome on a fair die (repeated faces add up). */
  readonly probability: number;
  readonly faceIndices: readonly number[];
}

export interface OutcomeCount extends Outcome {
  readonly observed: number;
}

export interface FairnessReport extends GoodnessOfFit {
  readonly dieId: string;
  readonly dieName: string;
  /** How many results of this die were collected. */
  readonly rolls: number;
  readonly outcomes: readonly OutcomeCount[];
}

export interface ThrowStats {
  readonly throws: number;
  readonly meanSeconds: number;
  readonly maxSeconds: number;
  readonly timeouts: number;
  readonly nudges: number;
}

export interface FairnessRun {
  readonly reports: readonly FairnessReport[];
  readonly throws: ThrowStats;
}

/** A die's outcomes in first-seen face order, e.g. ⚔️ (2/6), 🛡️ (2/6), 💀 (1/6), blank (1/6). */
export function outcomesOf(die: DieDefinition): Outcome[] {
  const byLabel = new Map<string, number[]>();
  die.faces.forEach((face, i) => {
    const list = byLabel.get(face.label);
    if (list) list.push(i);
    else byLabel.set(face.label, [i]);
  });
  return [...byLabel].map(([label, faceIndices]) => ({
    label,
    probability: faceIndices.length / die.faces.length,
    faceIndices,
  }));
}

/**
 * Throws the whole group `throws` times in a headless physics world and tests
 * each distinct die (copies are pooled) for a fair distribution of results.
 */
export function runFairness(
  dice: readonly DieDefinition[],
  throws: number,
  rng: Rng,
  arena: Arena,
  options: { shuffleLabels?: boolean } = {},
): FairnessRun {
  if (!Number.isInteger(throws) || throws < 1) {
    throw new RangeError('A fairness run needs at least one throw');
  }
  const world = new DiceWorld(arena);
  world.shuffleLabels = options.shuffleLabels ?? true;
  world.setDice(dice.map((d) => d.shape));
  const faceCounts = new Map<string, number[]>();
  for (const die of dice) faceCounts.set(die.id, Array<number>(die.faces.length).fill(0));

  let totalSeconds = 0;
  let maxSeconds = 0;
  let timeouts = 0;
  let nudges = 0;
  for (let t = 0; t < throws; t++) {
    const result = world.simulateThrow(rng);
    result.faces.forEach((face, i) => faceCounts.get(dice[i]!.id)![face]!++);
    totalSeconds += result.seconds;
    maxSeconds = Math.max(maxSeconds, result.seconds);
    if (result.timedOut) timeouts++;
    nudges += result.nudges;
  }

  const seen = new Set<string>();
  const reports = dice.flatMap((die) => {
    if (seen.has(die.id)) return [];
    seen.add(die.id);
    const counts = faceCounts.get(die.id)!;
    const outcomes = outcomesOf(die).map((o) => ({
      ...o,
      observed: o.faceIndices.reduce((sum, i) => sum + counts[i]!, 0),
    }));
    const fit = goodnessOfFit(
      outcomes.map((o) => o.observed),
      outcomes.map((o) => o.probability),
    );
    return [
      {
        dieId: die.id,
        dieName: die.name,
        rolls: counts.reduce((a, b) => a + b, 0),
        outcomes,
        ...fit,
      },
    ];
  });

  return {
    reports,
    throws: {
      throws,
      meanSeconds: totalSeconds / throws,
      maxSeconds,
      timeouts,
      nudges,
    },
  };
}

/** Markdown table summarising fairness reports. */
export function fairnessTable(reports: readonly FairnessReport[]): string {
  const rows = reports.map((r) => {
    const counts = r.outcomes.map((o) => o.observed);
    const spread = `${Math.min(...counts)}–${Math.max(...counts)}`;
    return `| ${r.dieName} | ${r.rolls} | ${r.outcomes.length} | ${spread} | ${r.statistic.toFixed(1)} | ${r.degreesOfFreedom} | ${r.pValue.toFixed(3)} |`;
  });
  return [
    '| Die | Rolls | Outcomes | Count range | χ² | df | p |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: |',
    ...rows,
  ].join('\n');
}
