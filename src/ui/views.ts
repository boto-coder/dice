import type { DieDefinition } from '../core/dice';
import type { History, HistoryEntry } from '../core/history';
import type { DieResult, RollResult } from '../core/results';
import type { Tray } from '../core/tray';

/** Creates an element with optional class name and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shown on a die result when it is a natural 20 or natural 1 on the d20. */
export const CRIT_BADGE = { success: 'Nat 20', failure: 'Nat 1' } as const;

function faceText(d: DieResult): string {
  return d.face.label === '' ? '–' : d.face.label;
}

function dieChip(d: DieResult): HTMLLIElement {
  const li = el('li', 'die-result');
  if (d.crit) li.classList.add(`die-result--${d.crit}`);
  li.append(el('span', 'die-result__name', d.name), el('span', 'die-result__value', faceText(d)));
  if (d.crit) li.append(el('span', 'die-result__badge', CRIT_BADGE[d.crit]));
  return li;
}

/** Fills the results panel with one chip per die and the total. */
export function renderResults(container: HTMLElement, result: RollResult | null): void {
  container.replaceChildren();
  if (!result) {
    container.append(el('p', 'results__hint', 'Add dice to the tray and press Roll.'));
    return;
  }
  const list = el('ul', 'results__dice');
  list.append(...result.dice.map(dieChip));
  container.append(list);
  if (result.total !== null) {
    const total = el('p', 'results__total', 'Total ');
    total.append(el('strong', 'results__total-value', String(result.total)));
    container.append(total);
  }
}

/**
 * Fills the tray list with one removable chip per die. Unknown dice are skipped.
 * Each chip button carries the die's `uid` in `data-uid`.
 */
export function renderTray(
  list: HTMLElement,
  tray: Tray,
  lookup: (dieId: string) => DieDefinition | undefined,
): void {
  list.replaceChildren(
    ...tray.flatMap(({ uid, dieId }) => {
      const die = lookup(dieId);
      if (!die) return [];
      const li = el('li', 'tray__item');
      const button = el('button', 'chip', die.name);
      button.type = 'button';
      button.dataset.uid = uid;
      button.setAttribute('aria-label', `Remove ${die.name} from tray`);
      li.append(button);
      return [li];
    }),
  );
}

function historyItem(entry: HistoryEntry): HTMLLIElement {
  const li = el('li', 'history__entry');
  const head = el('div', 'history__head');
  head.append(el('span', 'history__group', entry.label));
  if (entry.result.total !== null) {
    head.append(el('span', 'history__total', `Total ${entry.result.total}`));
  }
  const values = el('ul', 'history__values');
  values.append(
    ...entry.result.dice.map((d) => {
      const v = el('li', 'history__value', `${d.name} ${faceText(d)}`);
      if (d.crit) {
        v.classList.add(`history__value--${d.crit}`);
        v.title = CRIT_BADGE[d.crit];
      }
      return v;
    }),
  );
  li.append(head, values);
  return li;
}

/** Fills the history list, newest first. */
export function renderHistory(list: HTMLElement, history: History): void {
  list.replaceChildren(...history.map(historyItem));
}
