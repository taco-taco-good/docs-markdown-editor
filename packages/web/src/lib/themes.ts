export interface ThemeColors {
  "surface-0": string;
  "surface-1": string;
  "surface-2": string;
  "surface-3": string;
  "surface-4": string;
  "surface-5": string;
  "text-primary": string;
  "text-secondary": string;
  "text-tertiary": string;
  "text-muted": string;
  accent: string;
  "accent-hover": string;
  "accent-muted": string;
  border: string;
  "border-active": string;
  danger: string;
  success: string;
  info: string;
}

export interface ThemeDef {
  id: string;
  name: string;
  appearance: "dark" | "light";
  colors: ThemeColors;
}

// ── Built-in Themes ──

const oneDark: ThemeDef = {
  id: "one-dark",
  name: "One Dark",
  appearance: "dark",
  colors: {
    "surface-0": "#1e2127",
    "surface-1": "#23272f",
    "surface-2": "#282c34",
    "surface-3": "#2f3440",
    "surface-4": "#3a404c",
    "surface-5": "#464d5c",
    "text-primary": "#abb2bf",
    "text-secondary": "#9da5b4",
    "text-tertiary": "#7f8795",
    "text-muted": "#666d7a",
    accent: "#61afef",
    "accent-hover": "#7dc2f5",
    "accent-muted": "#61afef22",
    border: "#313640",
    "border-active": "#3f4653",
    danger: "#e06c75",
    success: "#98c379",
    info: "#56b6c2",
  },
};

const tokyoNight: ThemeDef = {
  id: "tokyo-night",
  name: "Tokyo Night",
  appearance: "dark",
  colors: {
    "surface-0": "#16161e",
    "surface-1": "#1a1b26",
    "surface-2": "#1f2335",
    "surface-3": "#24283b",
    "surface-4": "#2f3549",
    "surface-5": "#3b4261",
    "text-primary": "#c0caf5",
    "text-secondary": "#a9b1d6",
    "text-tertiary": "#787c99",
    "text-muted": "#565f89",
    accent: "#7aa2f7",
    "accent-hover": "#89b4fa",
    "accent-muted": "#7aa2f722",
    border: "#27293d",
    "border-active": "#3b4261",
    danger: "#f7768e",
    success: "#9ece6a",
    info: "#7dcfff",
  },
};

const tokyoNightStorm: ThemeDef = {
  id: "tokyo-night-storm",
  name: "Tokyo Night Storm",
  appearance: "dark",
  colors: {
    "surface-0": "#1f2335",
    "surface-1": "#24283b",
    "surface-2": "#292e42",
    "surface-3": "#2f3549",
    "surface-4": "#3b4261",
    "surface-5": "#545c7e",
    "text-primary": "#c0caf5",
    "text-secondary": "#a9b1d6",
    "text-tertiary": "#787c99",
    "text-muted": "#565f89",
    accent: "#7aa2f7",
    "accent-hover": "#89b4fa",
    "accent-muted": "#7aa2f722",
    border: "#2f3549",
    "border-active": "#3b4261",
    danger: "#f7768e",
    success: "#9ece6a",
    info: "#7dcfff",
  },
};

const catppuccinMocha: ThemeDef = {
  id: "catppuccin-mocha",
  name: "Catppuccin Mocha",
  appearance: "dark",
  colors: {
    "surface-0": "#1e1e2e",
    "surface-1": "#181825",
    "surface-2": "#313244",
    "surface-3": "#45475a",
    "surface-4": "#585b70",
    "surface-5": "#6c7086",
    "text-primary": "#cdd6f4",
    "text-secondary": "#bac2de",
    "text-tertiary": "#a6adc8",
    "text-muted": "#6c7086",
    accent: "#89b4fa",
    "accent-hover": "#b4d0fb",
    "accent-muted": "#89b4fa22",
    border: "#313244",
    "border-active": "#45475a",
    danger: "#f38ba8",
    success: "#a6e3a1",
    info: "#89dceb",
  },
};

const catppuccinMacchiato: ThemeDef = {
  id: "catppuccin-macchiato",
  name: "Catppuccin Macchiato",
  appearance: "dark",
  colors: {
    "surface-0": "#24273a",
    "surface-1": "#1e2030",
    "surface-2": "#363a4f",
    "surface-3": "#494d64",
    "surface-4": "#5b6078",
    "surface-5": "#6e738d",
    "text-primary": "#cad3f5",
    "text-secondary": "#b8c0e0",
    "text-tertiary": "#a5adcb",
    "text-muted": "#6e738d",
    accent: "#8aadf4",
    "accent-hover": "#b7d1f8",
    "accent-muted": "#8aadf422",
    border: "#363a4f",
    "border-active": "#494d64",
    danger: "#ed8796",
    success: "#a6da95",
    info: "#91d7e3",
  },
};

const catppuccinLatte: ThemeDef = {
  id: "catppuccin-latte",
  name: "Catppuccin Latte",
  appearance: "light",
  colors: {
    "surface-0": "#eff1f5",
    "surface-1": "#e6e9ef",
    "surface-2": "#dce0e8",
    "surface-3": "#ccd0da",
    "surface-4": "#bcc0cc",
    "surface-5": "#acb0be",
    "text-primary": "#4c4f69",
    "text-secondary": "#5c5f77",
    "text-tertiary": "#6c6f85",
    "text-muted": "#9ca0b0",
    accent: "#1e66f5",
    "accent-hover": "#2a6ff7",
    "accent-muted": "#1e66f522",
    border: "#ccd0da",
    "border-active": "#bcc0cc",
    danger: "#d20f39",
    success: "#40a02b",
    info: "#04a5e5",
  },
};

const rosePine: ThemeDef = {
  id: "rose-pine",
  name: "Rosé Pine",
  appearance: "dark",
  colors: {
    "surface-0": "#191724",
    "surface-1": "#1f1d2e",
    "surface-2": "#26233a",
    "surface-3": "#2a2837",
    "surface-4": "#393552",
    "surface-5": "#524f67",
    "text-primary": "#e0def4",
    "text-secondary": "#c4a7e7",
    "text-tertiary": "#908caa",
    "text-muted": "#6e6a86",
    accent: "#c4a7e7",
    "accent-hover": "#d4bdf0",
    "accent-muted": "#c4a7e722",
    border: "#2a2837",
    "border-active": "#393552",
    danger: "#eb6f92",
    success: "#9ccfd8",
    info: "#31748f",
  },
};

const nordDark: ThemeDef = {
  id: "nord",
  name: "Nord",
  appearance: "dark",
  colors: {
    "surface-0": "#2e3440",
    "surface-1": "#3b4252",
    "surface-2": "#434c5e",
    "surface-3": "#4c566a",
    "surface-4": "#556177",
    "surface-5": "#616e88",
    "text-primary": "#eceff4",
    "text-secondary": "#e5e9f0",
    "text-tertiary": "#d8dee9",
    "text-muted": "#7b88a1",
    accent: "#88c0d0",
    "accent-hover": "#8fbcbb",
    "accent-muted": "#88c0d022",
    border: "#3b4252",
    "border-active": "#4c566a",
    danger: "#bf616a",
    success: "#a3be8c",
    info: "#81a1c1",
  },
};

export const builtinThemes: ThemeDef[] = [
  oneDark,
  tokyoNight,
  tokyoNightStorm,
  catppuccinMocha,
  catppuccinMacchiato,
  catppuccinLatte,
  rosePine,
  nordDark,
];

export const DEFAULT_THEME_ID = "one-dark";

const STORAGE_KEY = "docs-md-theme";

export function getSavedThemeId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage unavailable
  }
}

export function resolveTheme(id: string, customThemes: ThemeDef[] = []): ThemeDef {
  const all = [...builtinThemes, ...customThemes];
  return all.find((t) => t.id === id) ?? builtinThemes[0];
}

export function applyTheme(theme: ThemeDef): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--color-${key}`, value);
  }
  root.setAttribute("data-appearance", theme.appearance);
}
