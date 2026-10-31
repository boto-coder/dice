import type { DieDefinition } from './dice';
import { randomId } from './random';

export const MAX_TRAY_DICE = 20;

/** One die placed in the tray. `uid` distinguishes two copies of the same die. */
export interface TrayDie {
  readonly uid: string;
  readonly dieId: string;
}

export type Tray = readonly TrayDie[];

export const EMPTY_TRAY: Tray = [];

export function isTrayFull(tray: Tray): boolean {
  return tray.length >= MAX_TRAY_DICE;
}

/** Adds a die to the tray. Returns the same tray unchanged if it is full. */
export function addToTray(tray: Tray, dieId: string, uid: string = randomId()): Tray {
  if (isTrayFull(tray)) return tray;
  return [...tray, { uid, dieId }];
}

export function removeFromTray(tray: Tray, uid: string): Tray {
  return tray.filter((d) => d.uid !== uid);
}

/** Removes dice whose definition no longer exists (e.g. a deleted custom die). */
export function pruneTray(tray: Tray, exists: (dieId: string) => boolean): Tray {
  const pruned = tray.filter((d) => exists(d.dieId));
  return pruned.length === tray.length ? tray : pruned;
}

/**
 * Human-readable summary like "2 × d6 + 1 × Combat die", grouped by die in
 * first-seen order. Unknown dice are skipped.
 */
export function describeTray(
  tray: Tray,
  lookup: (dieId: string) => DieDefinition | undefined,
): string {
  const counts = new Map<string, { name: string; count: number }>();
  for (const { dieId } of tray) {
    const die = lookup(dieId);
    if (!die) continue;
    const entry = counts.get(dieId);
    if (entry) entry.count++;
    else counts.set(dieId, { name: die.name, count: 1 });
  }
  return [...counts.values()].map(({ name, count }) => `${count} × ${name}`).join(' + ');
}
