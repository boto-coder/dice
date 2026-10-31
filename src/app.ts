/** Renders the application shell into the given root element. */
export function mountApp(root: HTMLElement): void {
  root.innerHTML = '';

  const main = document.createElement('main');
  main.className = 'app';

  const title = document.createElement('h1');
  title.className = 'app__title';
  title.textContent = 'Dice Roller';

  main.append(title);
  root.append(main);
}
