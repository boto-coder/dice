import { randomId } from './random';
import type { RollResult } from './results';

export const MAX_HISTORY = 20;

export interface HistoryEntry {
  readonly id: string;
  readonly timestamp: number;
  /** Summary of the rolled group, e.g. "2 × d6 + 1 × d10". */
  readonly label: string;
  readonly result: RollResult;
}

/** Newest first. Session-only: never persisted. */
export type History = readonly HistoryEntry[];

export const EMPTY_HISTORY: History = [];

export function createHistoryEntry(
  result: RollResult,
  label: string,
  timestamp: number = Date.now(),
  id: string = randomId(),
): HistoryEntry {
  return { id, timestamp, label, result };
}

/** Adds an entry at the front, dropping the oldest beyond MAX_HISTORY. */
export function addHistoryEntry(history: History, entry: HistoryEntry): History {
  return [entry, ...history].slice(0, MAX_HISTORY);
}

export function clearHistory(): History {
  return EMPTY_HISTORY;
}
