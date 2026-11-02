import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

export const SW_FILE = 'sw.js';
const TEMPLATE = new URL('./sw-template.js', import.meta.url);

/** Files to precache: everything except the service worker itself and source maps. */
export function precacheList(files: Iterable<string>): string[] {
  const list = [...new Set(files)].filter((f) => f !== SW_FILE && !f.endsWith('.map'));
  return ['./', ...list.sort()];
}

/** Content hash over the given files, so any change yields a new cache version. */
export function contentVersion(contents: ReadonlyMap<string, string | Uint8Array>): string {
  const hash = createHash('sha256');
  for (const name of [...contents.keys()].sort()) {
    hash.update(name).update('\0').update(contents.get(name)!).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/** Fills the service worker template with the precache list and version. */
export function serviceWorkerSource(
  template: string,
  files: readonly string[],
  version: string,
): string {
  return template
    .replace('/* global __PRECACHE__, __VERSION__ */\n', '')
    .replace('__PRECACHE__', JSON.stringify(files))
    .replace('__VERSION__', JSON.stringify(version));
}

function listFiles(dir: string, root: string = dir): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? listFiles(path, root)
      : [relative(root, path).split(sep).join('/')];
  });
}

/**
 * Emits sw.js at build time, precaching every bundle file plus the public
 * folder. Dev mode gets no service worker.
 */
export function pwaPlugin(): Plugin {
  let publicDir = '';
  return {
    name: 'dice-roller-pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const contents = new Map<string, string | Uint8Array>();
      for (const [fileName, item] of Object.entries(bundle)) {
        contents.set(fileName, item.type === 'chunk' ? item.code : item.source);
      }
      for (const file of publicDir ? listFiles(publicDir) : []) {
        contents.set(file, readFileSync(join(publicDir, file)));
      }
      const files = precacheList(contents.keys());
      const source = serviceWorkerSource(
        readFileSync(TEMPLATE, 'utf8'),
        files,
        contentVersion(contents),
      );
      this.emitFile({ type: 'asset', fileName: SW_FILE, source });
    },
  };
}
