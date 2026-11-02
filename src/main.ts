import './style.css';
import { mountApp } from './app';
import { createDiceTable } from './render/table';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('Missing #app root element');
}
/** localStorage, or null where it is blocked (e.g. some private-browsing modes). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

mountApp(root, { createTable: (el) => createDiceTable(el), storage: browserStorage() });
