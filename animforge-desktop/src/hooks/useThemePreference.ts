import { useCallback, useEffect, useState } from 'react';
import type { ResolvedTheme, ThemePreference } from '../types';

export const THEME_STORAGE_KEY = 'animforge:theme';

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') {
      return raw;
    }
  } catch {
    // Ignore storage failures in restricted webviews
  }
  return 'dark';
}

function getSystemDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function resolveTheme(pref: ThemePreference, systemDark = getSystemDark()): ResolvedTheme {
  if (pref === 'system') {
    return systemDark ? 'dark' : 'light';
  }
  return pref;
}

function applyThemeToDocument(pref: ThemePreference, resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute('content', pref === 'system' ? 'light dark' : pref);
  }
  document.documentElement.dataset.themePref = pref;
  document.documentElement.dataset.resolvedTheme = resolved;
}

export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDark);

  const resolvedTheme = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyThemeToDocument(preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (ev: MediaQueryListEvent) => {
      setSystemDark(ev.matches);
    };
    setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== THEME_STORAGE_KEY) return;
      if (ev.newValue === 'dark' || ev.newValue === 'light' || ev.newValue === 'system') {
        setPreferenceState(ev.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures
    }
  }, []);

  const cyclePreference = useCallback(() => {
    const order: ThemePreference[] = ['dark', 'light', 'system'];
    setPreference(order[(order.indexOf(preference) + 1) % order.length]);
  }, [preference, setPreference]);

  return {
    preference,
    resolvedTheme,
    setPreference,
    cyclePreference,
  };
}
