import { useCallback, useEffect, useState } from 'react';

export const BOARD_THEME_STORAGE_KEY = 'chorequest-board-theme';
export const BOARD_THEME_CHANGED_EVENT = 'chorequest:board-theme-changed';

function readStoredBoardTheme() {
  try {
    return localStorage.getItem(BOARD_THEME_STORAGE_KEY) || 'default';
  } catch {
    return 'default';
  }
}

export function useBoardTheme() {
  const [boardTheme, setBoardThemeState] = useState(readStoredBoardTheme);

  const setBoardTheme = useCallback((themeId) => {
    const nextTheme = themeId || 'default';
    setBoardThemeState(nextTheme);

    try {
      localStorage.setItem(BOARD_THEME_STORAGE_KEY, nextTheme);
      window.dispatchEvent(new CustomEvent(BOARD_THEME_CHANGED_EVENT, {
        detail: nextTheme,
      }));
    } catch {
      // Local persistence is a convenience; the UI can still update in memory.
    }
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      setBoardThemeState(readStoredBoardTheme());
    };

    const syncFromEvent = (event) => {
      setBoardThemeState(event.detail || readStoredBoardTheme());
    };

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(BOARD_THEME_CHANGED_EVENT, syncFromEvent);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(BOARD_THEME_CHANGED_EVENT, syncFromEvent);
    };
  }, []);

  return { boardTheme, setBoardTheme };
}
