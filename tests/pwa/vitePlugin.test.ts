import { describe, it, expect, vi } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import {
  SW_FILE,
  contentVersion,
  precacheList,
  pwaPlugin,
  serviceWorkerSource,
} from '../../pwa/vitePlugin';

const template = readFileSync(new URL('../../pwa/sw-template.js', import.meta.url), 'utf8');

describe('precacheList', () => {
  it('starts with the scope root, sorts, dedupes, and skips sw.js and source maps', () => {
    expect(
      precacheList(['index.html', 'assets/a.js', SW_FILE, 'assets/a.js.map', 'assets/a.js']),
    ).toEqual(['./', 'assets/a.js', 'index.html']);
  });
});

describe('contentVersion', () => {
  it('is stable regardless of order and changes with content or names', () => {
    const a = contentVersion(
      new Map([
        ['x', '1'],
        ['y', '2'],
      ]),
    );
    expect(
      contentVersion(
        new Map([
          ['y', '2'],
          ['x', '1'],
        ]),
      ),
    ).toBe(a);
    expect(
      contentVersion(
        new Map([
          ['x', '1'],
          ['y', '3'],
        ]),
      ),
    ).not.toBe(a);
    expect(
      contentVersion(
        new Map([
          ['x', '1'],
          ['z', '2'],
        ]),
      ),
    ).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('serviceWorkerSource', () => {
  it('fills in the file list and version and produces valid JavaScript', () => {
    const source = serviceWorkerSource(template, ['./', 'index.html'], 'abc123');
    expect(source).not.toMatch(/__PRECACHE__|__VERSION__/);
    expect(source).toContain('const PRECACHE = ["./","index.html"];');
    expect(source).toContain('const CACHE = CACHE_PREFIX + "abc123";');
    expect(() => new Script(source)).not.toThrow();
  });
});

describe('pwaPlugin', () => {
  it('emits sw.js precaching the bundle and the public folder', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'dice-public-'));
    writeFileSync(join(publicDir, 'icon.svg'), '<svg/>');
    mkdirSync(join(publicDir, 'nested'));
    writeFileSync(join(publicDir, 'nested', 'x.png'), 'png');

    const plugin = pwaPlugin();
    expect(plugin.apply).toBe('build');
    (plugin.configResolved as (c: { publicDir: string }) => void)({ publicDir });
    const emitFile = vi.fn();
    const bundle = {
      'index.html': { type: 'asset', source: '<html></html>' },
      'assets/index.js': { type: 'chunk', code: 'console.log(1)' },
    };
    (plugin.generateBundle as (this: unknown, o: unknown, b: unknown) => void).call(
      { emitFile },
      {},
      bundle,
    );

    expect(emitFile).toHaveBeenCalledTimes(1);
    const { fileName, source, type } = emitFile.mock.calls[0]![0];
    expect(type).toBe('asset');
    expect(fileName).toBe(SW_FILE);
    expect(source).toContain('["./","assets/index.js","icon.svg","index.html","nested/x.png"]');
  });

  it('copes with a missing public folder', () => {
    const plugin = pwaPlugin();
    (plugin.configResolved as (c: { publicDir: string }) => void)({
      publicDir: join(tmpdir(), 'does-not-exist-dice'),
    });
    const emitFile = vi.fn();
    (plugin.generateBundle as (this: unknown, o: unknown, b: unknown) => void).call(
      { emitFile },
      {},
      { 'index.html': { type: 'asset', source: '' } },
    );
    expect(emitFile.mock.calls[0]![0].source).toContain('const PRECACHE = ["./","index.html"];');
  });
});
