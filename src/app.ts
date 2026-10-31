import { findDie } from './core/dice';
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
      <div class="controls">
        <button type="button" class="btn btn--primary" data-action="roll">Roll d6</button>
      </div>
      <p class="result" role="status" aria-live="polite"></p>
    </main>
  `;

  const tableEl = root.querySelector<HTMLElement>('.table')!;
  const rollButton = root.querySelector<HTMLButtonElement>('[data-action="roll"]')!;
  const resultEl = root.querySelector<HTMLElement>('.result')!;

  let table: DiceTable | null = null;
  try {
    table = deps.createTable(tableEl);
  } catch {
    tableEl.classList.add('table--unsupported');
    tableEl.textContent = 'Your browser cannot show 3D graphics (WebGL is unavailable).';
    rollButton.disabled = true;
  }

  const d6 = findDie('d6')!;

  rollButton.addEventListener('click', async () => {
    if (!table) return;
    rollButton.disabled = true;
    rollButton.setAttribute('aria-busy', 'true');
    resultEl.textContent = 'Rolling…';
    try {
      const faces = await table.roll([d6]);
      const result = buildRollResult(faces.map((faceIndex) => ({ die: d6, faceIndex })));
      resultEl.textContent = describeRoll(result);
    } catch {
      resultEl.textContent = 'Something went wrong while rolling. Please try again.';
    } finally {
      rollButton.disabled = false;
      rollButton.removeAttribute('aria-busy');
    }
  });

  return {
    dispose() {
      table?.dispose();
      root.innerHTML = '';
    },
  };
}
