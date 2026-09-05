import { describe, expect, it } from 'vitest';
import { parseConfig, serializeConfig, ElectionConfig } from './urlState';

const config: ElectionConfig = {
  candidates: [
    { id: 'a', name: 'A', x: 0.3, y: 0.5, color: '#ef4444' },
    { id: 'smith, jr.; b', name: 'Smith, Jr.; B', x: 0.7, y: 0.5, color: '#3b82f6' },
  ],
  blocs: [{ id: 'bloc-0', position: { x: 0.5, y: 0.5 }, spread: 0.1, count: 500 }],
  method: 'irv',
  approvalThreshold: 0.3,
};

describe('urlState', () => {
  it('round-trips a config, including names with delimiters', () => {
    const parsed = parseConfig(new URLSearchParams(serializeConfig(config)));
    expect(parsed).not.toBeNull();
    expect(parsed!.candidates.map((c) => c.name)).toEqual(['A', 'Smith, Jr.; B']);
    expect(parsed!.blocs[0].count).toBe(500);
    expect(parsed!.method).toBe('irv');
  });

  it('treats unversioned legacy links as raw names, even valid-looking escapes', () => {
    // Older links were serialized without a version marker or name encoding.
    const params = new URLSearchParams(serializeConfig(config));
    params.delete('v');
    params.set(
      'candidates',
      '100% Real,0.300,0.500,#ef4444;Alice%20Bob,0.700,0.500,#3b82f6'
    );
    const parsed = parseConfig(params);
    expect(parsed).not.toBeNull();
    expect(parsed!.candidates.map((c) => c.name)).toEqual(['100% Real', 'Alice%20Bob']);
    expect(parsed!.candidates[1].id).toBe('alice%20bob');
  });

  it('rejects an unknown method', () => {
    const params = new URLSearchParams(serializeConfig(config));
    params.set('method', 'star');
    expect(parseConfig(params)).toBeNull();
  });

  it('rejects non-numeric coordinates', () => {
    const params = new URLSearchParams(serializeConfig(config));
    params.set('blocs', 'abc,0.5,0.1,500');
    expect(parseConfig(params)).toBeNull();
  });
});
