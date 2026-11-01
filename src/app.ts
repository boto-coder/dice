import { STANDARD_DICE, type DieDefinition } from './core/dice';
import { buildRollResult, describeRoll } from './core/results';
import type { DiceTable } from './render/table';

export interface AppDeps {
  /** Creates the 3D table inside the given element. May throw if WebGL is unavailable. */
  createTable: (container: HTMLElement) => DiceTable;
}

export interface AppHandle {
  dispose(): void;
}

/** Renders the application into the given root element. */
export function mountApp(root: HTMLElement, deps: AppDeps): AppHandle {
  root.innerHTML = `
    <main class="app">
      <h1 class="app__title">Dice Roller</h1>
      <section class="table" aria-label="Dice table"></section>
      <div class="controls" role="group" aria-label="Roll dice">
        ${STANDARD_DICE.map(
          (d) =>
            `<button type="button" class="btn" data-roll="${d.id}" aria-label="Roll ${d.name}">${d.name}</button>`,
        ).join('')}
        <button type="button" class="btn btn--primary" data-roll="all">Roll all</button>
      </div>
      <p class="result" role="status" aria-live="polite"></p>
    </main>
  `;

  const tableEl = root.querySelector<HTMLElement>('.table')!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-roll]')];
  const resultEl = root.querySelector<HTMLElement>('.result')!;

  let table: DiceTable | null = null;
  try {
    table = deps.createTable(tableEl);
  } catch {
    tableEl.classList.add('table--unsupported');
    tableEl.textContent = 'Your browser cannot show 3D graphics (WebGL is unavailable).';
    for (const b of buttons) b.disabled = true;
  }

  function setBusy(busy: boolean): void {
    for (const b of buttons) b.disabled = busy;
    if (busy) root.querySelector('.controls')!.setAttribute('aria-busy', 'true');
    else root.querySelector('.controls')!.removeAttribute('aria-busy');
  }

  async function roll(dice: readonly DieDefinition[]): Promise<void> {
    if (!table) return;
    setBusy(true);
    resultEl.textContent = 'Rolling…';
    try {
      const faces = await table.roll(dice);
      const result = buildRollResult(faces.map((faceIndex, i) => ({ die: dice[i]!, faceIndex })));
      resultEl.textContent = describeRoll(result);
    } catch {
      resultEl.textContent = 'Something went wrong while rolling. Please try again.';
    } finally {
      setBusy(false);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const id = button.dataset.roll;
      void roll(id === 'all' ? STANDARD_DICE : STANDARD_DICE.filter((d) => d.id === id));
    });
  }

  return {
    dispose() {
      table?.dispose();
      root.innerHTML = '';
    },
  };
}
