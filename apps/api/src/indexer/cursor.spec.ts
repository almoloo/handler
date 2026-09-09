import { describe, expect, it } from 'vitest';
import { cursorKeyFor } from './cursor.js';

describe('cursorKeyFor', () => {
  it('lowercases the address', () => {
    expect(cursorKeyFor('0xABCD')).toBe('wallet:0xabcd');
  });
});
