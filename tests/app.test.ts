// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getByRole } from '@testing-library/dom';
import { mountApp } from '../src/app';

describe('mountApp', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app')!;
  });

  it('renders the main landmark with the app title', () => {
    mountApp(root);
    const main = getByRole(root, 'main');
    expect(getByRole(main, 'heading', { level: 1, name: 'Dice Roller' })).toBeInTheDocument();
  });

  it('replaces existing content when mounted twice', () => {
    mountApp(root);
    mountApp(root);
    expect(root.querySelectorAll('main')).toHaveLength(1);
  });
});
