import './style.css';
import { mountApp } from './app';
import { createDiceTable } from './render/table';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('Missing #app root element');
}
mountApp(root, { createTable: (el) => createDiceTable(el) });
