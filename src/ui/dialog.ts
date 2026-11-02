/**
 * Opens a dialog modally where supported (focus is trapped and Escape closes
 * it). Falls back to the `open` attribute, e.g. in jsdom.
 */
export function openDialog(dialog: HTMLDialogElement): void {
  if (dialog.hasAttribute('open')) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/** Closes a dialog opened with openDialog and fires its `close` event. */
export function closeDialog(dialog: HTMLDialogElement): void {
  if (!dialog.hasAttribute('open')) return;
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  }
}
