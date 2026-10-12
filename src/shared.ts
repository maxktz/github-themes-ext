export type Mode = 'dark' | 'light';

/** A theme chosen for one color mode, stored with its generated CSS. */
export interface StoredTheme {
  id: string;
  css: string;
}

/** chrome.storage.local keys: the theme used while GitHub is in each mode. */
export const MODE_KEYS: Record<Mode, string> = {
  dark: 'darkTheme',
  light: 'lightTheme',
};
