import { STANDARD_DICE, findDie, type DieDefinition } from './core/dice';
import {
  EMPTY_HISTORY,
  addHistoryEntry,
  clearHistory,
  createHistoryEntry,
  type History,
} from './core/history';
import { buildRollResult, describeRoll, type RollResult } from './core/results';
import {
  EMPTY_TRAY,
  MAX_TRAY_DICE,
  addToTray,
  describeTray,
  isTrayFull,
  removeFromTray,
  type Tray,
} from './core/tray';
import type { DiceTable } from './render/table';
import { renderHistory, renderResults, renderTray } from './ui/views';

export interface AppDeps {
  /** Creates the 3D table inside the given element. May throw if WebGL is unavailable. */
  createTable: (container: HTMLElement) => DiceTable;
}

export interface AppHandle {
  dispose(): void;
}

const ROLL_ERROR = 'Something went wrong while rolling. Please try again.';
const NO_WEBGL = 'Your browser cannot show 3D graphics (WebGL is unavailable).';

/**
 * Marks a button as unavailable with aria-disabled rather than `disabled`, so
 * it keeps keyboard focus (e.g. Roll while dice are rolling).
 */
function setAvailable(button: HTMLButtonElement, available: boolean): void {
  if (available) button.removeAttribute('aria-disabled');
  else button.setAttribute('aria-disabled', 'true');
}

function isAvailable(button: HTMLButtonElement): boolean {
  return button.getAttribute('aria-disabled') !== 'true';
}

/** Renders the application into the given root element. */
export function mountApp(root: HTMLElement, deps: AppDeps): AppHandle {
  root.innerHTML = `
    <main class="app">
      <header class="app__header">
        <h1 class="app__title">Dice Roller</h1>
      </header>
      <section class="table" aria-label="Dice table"></section>
      <section class="results" aria-labelledby="results-title">
        <h2 class="visually-hidden" id="results-title">Results</h2>
        <div class="results__body"></div>
        <p class="visually-hidden" role="status" aria-live="polite"></p>
      </section>
      <div class="dice-bar" role="group" aria-label="Add dice">
        ${STANDARD_DICE.map(
          (d) =>
            `<button type="button" class="btn btn--die" data-add="${d.id}" aria-label="Add ${d.name} to tray">${d.name}</button>`,
        ).join('')}
      </div>
      <section class="tray" aria-labelledby="tray-title">
        <div class="tray__header">
          <h2 class="tray__title" id="tray-title">Tray</h2>
          <span class="tray__count" aria-live="polite"></span>
          <button type="button" class="btn btn--small" data-action="clear-tray">Clear tray</button>
        </div>
        <ul class="tray__list"></ul>
        <p class="tray__hint">Tap a die above to add it. Tap a die here to remove it.</p>
      </section>
      <div class="actions" role="group" aria-label="Roll">
        <button type="button" class="btn btn--primary" data-action="roll">Roll</button>
        <button type="button" class="btn" data-action="roll-again">Roll again</button>
      </div>
      <details class="history">
        <summary class="history__summary">History <span class="history__count"></span></summary>
        <div class="history__body">
          <button type="button" class="btn btn--small" data-action="clear-history">Clear history</button>
          <ol class="history__list"></ol>
          <p class="history__empty">No rolls yet.</p>
        </div>
      </details>
    </main>
  `;

  const q = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
  const tableEl = q<HTMLElement>('.table');
  const resultsEl = q<HTMLElement>('.results');
  const resultsBody = q<HTMLElement>('.results__body');
  const statusEl = q<HTMLElement>('[role="status"]');
  const addButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-add]')];
  const trayList = q<HTMLElement>('.tray__list');
  const trayCount = q<HTMLElement>('.tray__count');
  const trayHint = q<HTMLElement>('.tray__hint');
  const clearTrayButton = q<HTMLButtonElement>('[data-action="clear-tray"]');
  const rollButton = q<HTMLButtonElement>('[data-action="roll"]');
  const againButton = q<HTMLButtonElement>('[data-action="roll-again"]');
  const historyEl = q<HTMLDetailsElement>('.history');
  const historyList = q<HTMLElement>('.history__list');
  const historyCount = q<HTMLElement>('.history__count');
  const historyEmpty = q<HTMLElement>('.history__empty');
  const clearHistoryButton = q<HTMLButtonElement>('[data-action="clear-history"]');

  // Open history by default where there is room for it next to the table.
  if (typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 900px)').matches) {
    historyEl.open = true;
  }

  const lookup = (id: string): DieDefinition | undefined => findDie(id);

  let tray: Tray = EMPTY_TRAY;
  let lastGroup: Tray | null = null;
  let history: History = EMPTY_HISTORY;
  let rolling = false;
  let table: DiceTable | null = null;

  try {
    table = deps.createTable(tableEl);
  } catch {
    tableEl.classList.add('table--unsupported');
    tableEl.textContent = NO_WEBGL;
  }

  function updateControls(): void {
    const full = isTrayFull(tray);
    for (const b of addButtons) setAvailable(b, table !== null && !full);
    setAvailable(clearTrayButton, tray.length > 0);
    setAvailable(rollButton, table !== null && !rolling && tray.length > 0);
    setAvailable(againButton, table !== null && !rolling && lastGroup !== null);
    setAvailable(clearHistoryButton, history.length > 0);
  }

  function updateTray(): void {
    renderTray(trayList, tray, lookup);
    const summary = describeTray(tray, lookup);
    trayCount.textContent = `${tray.length} / ${MAX_TRAY_DICE}${summary ? `: ${summary}` : ''}`;
    trayHint.textContent = isTrayFull(tray)
      ? `The tray is full (${MAX_TRAY_DICE} dice).`
      : 'Tap a die above to add it. Tap a die here to remove it.';
    updateControls();
  }

  function updateHistory(): void {
    renderHistory(historyList, history);
    historyCount.textContent = history.length > 0 ? `(${history.length})` : '';
    historyEmpty.hidden = history.length > 0;
    updateControls();
  }

  function showResult(result: RollResult | null): void {
    renderResults(resultsBody, result);
  }

  async function roll(group: Tray): Promise<void> {
    if (!table || rolling) return;
    const dice = group.map((d) => lookup(d.dieId)).filter((d) => d !== undefined);
    if (dice.length === 0) return;
    rolling = true;
    lastGroup = group;
    resultsEl.setAttribute('aria-busy', 'true');
    statusEl.textContent = 'Rolling…';
    updateControls();
    try {
      const faces = await table.roll(dice);
      const result = buildRollResult(faces.map((faceIndex, i) => ({ die: dice[i]!, faceIndex })));
      table.highlight(result.dice.map((d) => d.crit));
      showResult(result);
      statusEl.textContent = describeRoll(result);
      history = addHistoryEntry(history, createHistoryEntry(result, describeTray(group, lookup)));
      updateHistory();
    } catch {
      showResult(null);
      statusEl.textContent = ROLL_ERROR;
    } finally {
      rolling = false;
      resultsEl.removeAttribute('aria-busy');
      updateControls();
    }
  }

  for (const button of addButtons) {
    button.addEventListener('click', () => {
      if (!isAvailable(button)) return;
      tray = addToTray(tray, button.dataset.add!);
      updateTray();
    });
  }

  trayList.addEventListener('click', (event) => {
    const chip = (event.target as Element).closest<HTMLButtonElement>('button[data-uid]');
    if (!chip) return;
    const index = tray.findIndex((d) => d.uid === chip.dataset.uid);
    tray = removeFromTray(tray, chip.dataset.uid!);
    updateTray();
    // Keep keyboard focus in the tray: on the next die, or the previous if it was last.
    const chips = trayList.querySelectorAll<HTMLButtonElement>('button[data-uid]');
    (chips[Math.min(index, chips.length - 1)] ?? addButtons[0])?.focus();
  });

  clearTrayButton.addEventListener('click', () => {
    if (!isAvailable(clearTrayButton)) return;
    tray = EMPTY_TRAY;
    updateTray();
  });

  rollButton.addEventListener('click', () => {
    if (isAvailable(rollButton)) void roll(tray);
  });

  againButton.addEventListener('click', () => {
    if (isAvailable(againButton) && lastGroup) void roll(lastGroup);
  });

  clearHistoryButton.addEventListener('click', () => {
    if (!isAvailable(clearHistoryButton)) return;
    history = clearHistory();
    updateHistory();
  });

  showResult(null);
  updateTray();
  updateHistory();

  return {
    dispose() {
      table?.dispose();
      root.innerHTML = '';
    },
  };
}
