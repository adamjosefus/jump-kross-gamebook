import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  readonly preference: ThemePreference;
  readonly resolved: 'light' | 'dark';
  readonly setPreference: (preference: ThemePreference) => void;
}

const STORAGE_KEY = 'theme';
const query = () => window.matchMedia('(prefers-color-scheme: dark)');

const readPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
};

export const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  resolved: 'light',
  setPreference: () => undefined,
});

/** Dark mode via the `dark` class on <html>, following the system unless overridden. */
export const ThemeProvider = ({ children }: { readonly children: ReactNode }) => {
  const [preference, setPreferenceState] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => query().matches);

  useEffect(() => {
    const media = query();
    const listener = () => setSystemDark(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the choice then lasts for this visit.
    }
  };

  return <ThemeContext value={{ preference, resolved, setPreference }}>{children}</ThemeContext>;
};

export const useTheme = () => useContext(ThemeContext);
