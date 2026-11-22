export type Theme = 'light' | 'dark';

export function readTheme(): Theme {
  try {
    return localStorage.getItem('transitly-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('transitly-theme', theme);
  } catch {
    // Theme still applies for this visit when storage is unavailable.
  }
}
