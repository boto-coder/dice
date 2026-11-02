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

// Offline support: the service worker only exists in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Not fatal: the app still works online.
    });
  });
}
