import { createCustomDie } from './customDice';
import type { DieDefinition } from './dice';
import { parseStyle, type DiceStyle } from './diceStyle';

export const STORAGE_KEY = 'dice-roller:custom-dice';
/** Version 2 added an optional style per die; version 1 data still loads. */
export const STORAGE_VERSION = 2;
const READABLE_VERSIONS: readonly unknown[] = [1, 2];

interface StoredDie {
  id: string;
  name: string;
  faces: string[];
  /** Version 2 only. */
  style?: DiceStyle;
}

interface StoredData {
  version: 2;
  dice: StoredDie[];
}

export interface LoadResult {
  readonly dice: DieDefinition[];
  /** Problems found while loading; invalid entries are skipped, never fatal. */
  readonly warnings: string[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isStoredDie(x: unknown): x is StoredDie {
  return (
    isRecord(x) &&
    typeof x.id === 'string' &&
    x.id !== '' &&
    typeof x.name === 'string' &&
    Array.isArray(x.faces) &&
    x.faces.every((f) => typeof f === 'string')
  );
}

/** Loads saved custom dice. Never throws: corrupt or invalid data yields warnings. */
export function loadCustomDice(storage: Pick<Storage, 'getItem'>): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { dice: [], warnings: ['Saved dice are unavailable (storage is not accessible).'] };
  }
  if (raw === null) return { dice: [], warnings: [] };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { dice: [], warnings: ['Saved dice could not be read (corrupt data).'] };
  }

  if (!isRecord(data) || !READABLE_VERSIONS.includes(data.version) || !Array.isArray(data.dice)) {
    return { dice: [], warnings: ['Saved dice are in an unknown format and were ignored.'] };
  }

  const dice: DieDefinition[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  data.dice.forEach((entry: unknown, i: number) => {
    if (!isStoredDie(entry)) {
      warnings.push(`Saved die #${i + 1} is malformed and was skipped.`);
      return;
    }
    if (ids.has(entry.id)) {
      warnings.push(`Saved die "${entry.name}" is a duplicate and was skipped.`);
      return;
    }
    let style: DiceStyle | undefined;
    if (entry.style !== undefined) {
      style = parseStyle(entry.style) ?? undefined;
      if (!style) warnings.push(`The look of saved die "${entry.name}" was invalid and was reset.`);
    }
    try {
      const die = createCustomDie(
        { name: entry.name, faces: entry.faces, ...(style ? { style } : {}) },
        { id: entry.id, otherNames: dice.map((d) => d.name) },
      );
      ids.add(die.id);
      dice.push(die);
    } catch (e) {
      warnings.push(
        `Saved die "${entry.name}" is invalid and was skipped: ${(e as Error).message}`,
      );
    }
  });

  return { dice, warnings };
}

/** Saves custom dice. Returns false if storage is unavailable or full. */
export function saveCustomDice(
  storage: Pick<Storage, 'setItem'>,
  dice: readonly DieDefinition[],
): boolean {
  const data: StoredData = {
    version: STORAGE_VERSION,
    dice: dice
      .filter((d) => d.custom)
      .map((d) => ({
        id: d.id,
        name: d.name,
        faces: d.faces.map((f) => f.label),
        ...(d.style ? { style: d.style } : {}),
      })),
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
