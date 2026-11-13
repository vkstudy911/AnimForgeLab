import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, useThemePreference } from './useThemePreference';

describe('useThemePreference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '<meta name="color-scheme" content="light dark" />';
    delete document.documentElement.dataset.themePref;
    delete document.documentElement.dataset.resolvedTheme;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to dark mode on first launch and switches cleanly between dark, light, and system', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const { result } = renderHook(() => useThemePreference());
    expect(result.current.preference).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.resolvedTheme).toBe('dark');
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('dark');

    act(() => {
      result.current.setPreference('light');
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.dataset.resolvedTheme).toBe('light');
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('light');

    act(() => {
      result.current.setPreference('system');
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('light dark');
  });
});
