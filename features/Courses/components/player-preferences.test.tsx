import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerPreference } from './player-preferences';

let keySequence = 0;
let preferenceKey: string;

beforeEach(() => {
  preferenceKey = `openmembers:test:player-preference:${keySequence++}`;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('player preferences', () => {
  it('renders the server fallback even when the browser has a different saved preference', () => {
    localStorage.setItem(preferenceKey, 'saved');
    function Readout() {
      const [value] = usePlayerPreference(preferenceKey, 'server-default');
      return createElement('output', null, value);
    }

    expect(renderToString(createElement(Readout))).toBe('<output>server-default</output>');
    const browser = renderHook(() => usePlayerPreference(preferenceKey, 'server-default'));
    expect(browser.result.current[0]).toBe('saved');
  });

  it('publishes a preference change to another player in the same tab', () => {
    const first = renderHook(() => usePlayerPreference(preferenceKey, '1'));
    const second = renderHook(() => usePlayerPreference(preferenceKey, '1'));

    act(() => first.result.current[1]('0.4'));

    expect(first.result.current[0]).toBe('0.4');
    expect(second.result.current[0]).toBe('0.4');
    expect(localStorage.getItem(preferenceKey)).toBe('0.4');
  });

  it('keeps controls usable when storage reads and writes are blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    const first = renderHook(() => usePlayerPreference(preferenceKey, 'false'));
    const second = renderHook(() => usePlayerPreference(preferenceKey, 'false'));
    expect(first.result.current[0]).toBe('false');

    act(() => first.result.current[1]('true'));

    expect(first.result.current[0]).toBe('true');
    expect(second.result.current[0]).toBe('true');
  });

  it('uses the new session value when writes fail but the old stored value is readable', () => {
    localStorage.setItem(preferenceKey, '1');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage quota reached', 'QuotaExceededError');
    });
    const player = renderHook(() => usePlayerPreference(preferenceKey, '1'));

    act(() => player.result.current[1]('1.5'));

    expect(player.result.current[0]).toBe('1.5');
    expect(localStorage.getItem(preferenceKey)).toBe('1');
  });
});
