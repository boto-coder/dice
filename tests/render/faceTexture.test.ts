import { describe, it, expect } from 'vitest';
import { needsUnderline } from '../../src/render/faceTexture';

describe('needsUnderline', () => {
  it.each(['6', '9', '16', '91', '18', '81', '66', '99', '68', '89', '86', '98'])(
    'underlines %s (reads as another number upside down)',
    (label) => {
      expect(needsUnderline(label)).toBe(true);
    },
  );

  it.each(['1', '8', '11', '69', '88', '10', '60', '2', '7', '100', '', '⚔️', '6a'])(
    'does not underline %j',
    (label) => {
      expect(needsUnderline(label)).toBe(false);
    },
  );
});
