/**
 * Chat theme switching utility.
 *
 * Themes: 'silverpink' (default) | 'macaron' | 'retro'
 *
 * Applies a data-chat-theme attribute on <html>, which activates
 * the corresponding CSS custom property block in index.css.
 * Persists the choice in localStorage under 'chat-theme'.
 */

const STORAGE_KEY = "chat-theme";
const VALID_THEMES = ["silverpink", "macaron", "retro"];
const DEFAULT_THEME = "silverpink";

/** Theme metadata (labels, descriptions, asset paths) */
export const THEMES = {
  silverpink: {
    key: "silverpink",
    label: "银粉",
    description: "粉色系",
    bg: "#ffe0eb",
    assetsPath: "/assets/themes/silverpink",
  },
  macaron: {
    key: "macaron",
    label: "马卡龙",
    description: "紫色系",
    bg: "#f4e0ff",
    assetsPath: "/assets/themes/macaron",
  },
  retro: {
    key: "retro",
    label: "复古",
    description: "暖黄系",
    bg: "#fff8e0",
    assetsPath: "/assets/themes/retro",
  },
};

/** Read current theme from localStorage (fallback: default). */
export function getChatTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_THEMES.includes(stored)) return stored;
  } catch {}
  return DEFAULT_THEME;
}

/** Apply theme to DOM + persist to localStorage. */
export function setChatTheme(theme) {
  if (!VALID_THEMES.includes(theme)) theme = DEFAULT_THEME;
  localStorage.setItem(STORAGE_KEY, theme);
  applyThemeToDOM(theme);
}

/** Apply the data attribute to <html> without persisting. */
export function applyThemeToDOM(theme) {
  if (theme === DEFAULT_THEME) {
    document.documentElement.removeAttribute("data-chat-theme");
  } else {
    document.documentElement.setAttribute("data-chat-theme", theme);
  }
}

/** Initialize on app start: read stored theme and apply to DOM. */
export function initChatTheme() {
  applyThemeToDOM(getChatTheme());
}

/** Get the asset path for the current theme (e.g. '/assets/themes/silverpink'). */
export function getThemeAssetsPath(theme) {
  const t = theme || getChatTheme();
  return THEMES[t]?.assetsPath || THEMES[DEFAULT_THEME].assetsPath;
}

/** Get the bubble theme key for the current theme. */
export function getBubbleTheme(theme) {
  const t = theme || getChatTheme();
  return VALID_THEMES.includes(t) ? t : DEFAULT_THEME;
}
