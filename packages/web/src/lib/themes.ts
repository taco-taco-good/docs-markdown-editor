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

// ══════════════════════════════════════
//  Dark Themes
// ══════════════════════════════════════

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

const rosePineMoon: ThemeDef = {
  id: "rose-pine-moon",
  name: "Rosé Pine Moon",
  appearance: "dark",
  colors: {
    "surface-0": "#232136",
    "surface-1": "#2a273f",
    "surface-2": "#393552",
    "surface-3": "#44415a",
    "surface-4": "#56526e",
    "surface-5": "#6e6a86",
    "text-primary": "#e0def4",
    "text-secondary": "#c4a7e7",
    "text-tertiary": "#908caa",
    "text-muted": "#6e6a86",
    accent: "#c4a7e7",
    "accent-hover": "#d4bdf0",
    "accent-muted": "#c4a7e722",
    border: "#393552",
    "border-active": "#44415a",
    danger: "#eb6f92",
    success: "#9ccfd8",
    info: "#3e8fb0",
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

const dracula: ThemeDef = {
  id: "dracula",
  name: "Dracula",
  appearance: "dark",
  colors: {
    "surface-0": "#21222c",
    "surface-1": "#282a36",
    "surface-2": "#2d303d",
    "surface-3": "#343746",
    "surface-4": "#44475a",
    "surface-5": "#565972",
    "text-primary": "#f8f8f2",
    "text-secondary": "#e2e2dc",
    "text-tertiary": "#bfbfb9",
    "text-muted": "#6272a4",
    accent: "#bd93f9",
    "accent-hover": "#caa8fb",
    "accent-muted": "#bd93f922",
    border: "#343746",
    "border-active": "#44475a",
    danger: "#ff5555",
    success: "#50fa7b",
    info: "#8be9fd",
  },
};

const gruvboxDark: ThemeDef = {
  id: "gruvbox-dark",
  name: "Gruvbox Dark",
  appearance: "dark",
  colors: {
    "surface-0": "#1d2021",
    "surface-1": "#282828",
    "surface-2": "#32302f",
    "surface-3": "#3c3836",
    "surface-4": "#504945",
    "surface-5": "#665c54",
    "text-primary": "#ebdbb2",
    "text-secondary": "#d5c4a1",
    "text-tertiary": "#bdae93",
    "text-muted": "#7c6f64",
    accent: "#83a598",
    "accent-hover": "#8ec07c",
    "accent-muted": "#83a59822",
    border: "#3c3836",
    "border-active": "#504945",
    danger: "#fb4934",
    success: "#b8bb26",
    info: "#83a598",
  },
};

const solarizedDark: ThemeDef = {
  id: "solarized-dark",
  name: "Solarized Dark",
  appearance: "dark",
  colors: {
    "surface-0": "#00212b",
    "surface-1": "#002b36",
    "surface-2": "#073642",
    "surface-3": "#0a3f4e",
    "surface-4": "#1a4f5e",
    "surface-5": "#2a5f6e",
    "text-primary": "#839496",
    "text-secondary": "#93a1a1",
    "text-tertiary": "#657b83",
    "text-muted": "#586e75",
    accent: "#268bd2",
    "accent-hover": "#2e9ee6",
    "accent-muted": "#268bd222",
    border: "#073642",
    "border-active": "#0a3f4e",
    danger: "#dc322f",
    success: "#859900",
    info: "#2aa198",
  },
};

const everforestDark: ThemeDef = {
  id: "everforest-dark",
  name: "Everforest Dark",
  appearance: "dark",
  colors: {
    "surface-0": "#272e33",
    "surface-1": "#2d353b",
    "surface-2": "#343f44",
    "surface-3": "#3d484d",
    "surface-4": "#475258",
    "surface-5": "#56635a",
    "text-primary": "#d3c6aa",
    "text-secondary": "#c5b89a",
    "text-tertiary": "#9da9a0",
    "text-muted": "#7a8478",
    accent: "#a7c080",
    "accent-hover": "#b5cf92",
    "accent-muted": "#a7c08022",
    border: "#3d484d",
    "border-active": "#475258",
    danger: "#e67e80",
    success: "#a7c080",
    info: "#7fbbb3",
  },
};

// ══════════════════════════════════════
//  Light Themes
// ══════════════════════════════════════

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

const oneLight: ThemeDef = {
  id: "one-light",
  name: "One Light",
  appearance: "light",
  colors: {
    "surface-0": "#fafafa",
    "surface-1": "#f0f0f0",
    "surface-2": "#e5e5e6",
    "surface-3": "#dbdbdc",
    "surface-4": "#c8c8c9",
    "surface-5": "#a0a1a7",
    "text-primary": "#383a42",
    "text-secondary": "#4f5258",
    "text-tertiary": "#696c77",
    "text-muted": "#a0a1a7",
    accent: "#4078f2",
    "accent-hover": "#5588f5",
    "accent-muted": "#4078f222",
    border: "#dbdbdc",
    "border-active": "#c8c8c9",
    danger: "#e45649",
    success: "#50a14f",
    info: "#0184bc",
  },
};

const tokyoNightDay: ThemeDef = {
  id: "tokyo-night-day",
  name: "Tokyo Night Day",
  appearance: "light",
  colors: {
    "surface-0": "#e1e2e7",
    "surface-1": "#d5d6db",
    "surface-2": "#c8c9ce",
    "surface-3": "#b4b5b9",
    "surface-4": "#9699a3",
    "surface-5": "#8990a3",
    "text-primary": "#3760bf",
    "text-secondary": "#4a6ac7",
    "text-tertiary": "#6172b0",
    "text-muted": "#8990a3",
    accent: "#2e7de9",
    "accent-hover": "#4591ec",
    "accent-muted": "#2e7de922",
    border: "#c8c9ce",
    "border-active": "#b4b5b9",
    danger: "#f52a65",
    success: "#587539",
    info: "#007197",
  },
};

const rosePineDawn: ThemeDef = {
  id: "rose-pine-dawn",
  name: "Rosé Pine Dawn",
  appearance: "light",
  colors: {
    "surface-0": "#faf4ed",
    "surface-1": "#f2e9de",
    "surface-2": "#ebe0d1",
    "surface-3": "#dfd5c5",
    "surface-4": "#d0c5b5",
    "surface-5": "#9893a5",
    "text-primary": "#575279",
    "text-secondary": "#6e6a86",
    "text-tertiary": "#797593",
    "text-muted": "#9893a5",
    accent: "#907aa9",
    "accent-hover": "#a08ab9",
    "accent-muted": "#907aa922",
    border: "#dfd5c5",
    "border-active": "#d0c5b5",
    danger: "#b4637a",
    success: "#56949f",
    info: "#286983",
  },
};

const nordLight: ThemeDef = {
  id: "nord-light",
  name: "Nord Light",
  appearance: "light",
  colors: {
    "surface-0": "#eceff4",
    "surface-1": "#e5e9f0",
    "surface-2": "#d8dee9",
    "surface-3": "#c9ced8",
    "surface-4": "#b5bbc7",
    "surface-5": "#9ba2b0",
    "text-primary": "#2e3440",
    "text-secondary": "#3b4252",
    "text-tertiary": "#434c5e",
    "text-muted": "#7b88a1",
    accent: "#5e81ac",
    "accent-hover": "#6d8db5",
    "accent-muted": "#5e81ac22",
    border: "#d8dee9",
    "border-active": "#c9ced8",
    danger: "#bf616a",
    success: "#a3be8c",
    info: "#88c0d0",
  },
};

const githubLight: ThemeDef = {
  id: "github-light",
  name: "GitHub Light",
  appearance: "light",
  colors: {
    "surface-0": "#ffffff",
    "surface-1": "#f6f8fa",
    "surface-2": "#eaeef2",
    "surface-3": "#d0d7de",
    "surface-4": "#afb8c1",
    "surface-5": "#8c959f",
    "text-primary": "#1f2328",
    "text-secondary": "#31363b",
    "text-tertiary": "#656d76",
    "text-muted": "#8c959f",
    accent: "#0969da",
    "accent-hover": "#1177e5",
    "accent-muted": "#0969da22",
    border: "#d0d7de",
    "border-active": "#afb8c1",
    danger: "#d1242f",
    success: "#1a7f37",
    info: "#0969da",
  },
};

const solarizedLight: ThemeDef = {
  id: "solarized-light",
  name: "Solarized Light",
  appearance: "light",
  colors: {
    "surface-0": "#fdf6e3",
    "surface-1": "#f5efdc",
    "surface-2": "#eee8d5",
    "surface-3": "#e4dec9",
    "surface-4": "#d4cdba",
    "surface-5": "#b3ac9a",
    "text-primary": "#657b83",
    "text-secondary": "#586e75",
    "text-tertiary": "#839496",
    "text-muted": "#93a1a1",
    accent: "#268bd2",
    "accent-hover": "#2e9ee6",
    "accent-muted": "#268bd222",
    border: "#e4dec9",
    "border-active": "#d4cdba",
    danger: "#dc322f",
    success: "#859900",
    info: "#2aa198",
  },
};

const gruvboxLight: ThemeDef = {
  id: "gruvbox-light",
  name: "Gruvbox Light",
  appearance: "light",
  colors: {
    "surface-0": "#fbf1c7",
    "surface-1": "#f2e5bc",
    "surface-2": "#ebdbb2",
    "surface-3": "#d5c4a1",
    "surface-4": "#bdae93",
    "surface-5": "#a89984",
    "text-primary": "#3c3836",
    "text-secondary": "#504945",
    "text-tertiary": "#665c54",
    "text-muted": "#928374",
    accent: "#458588",
    "accent-hover": "#509194",
    "accent-muted": "#45858822",
    border: "#d5c4a1",
    "border-active": "#bdae93",
    danger: "#cc241d",
    success: "#98971a",
    info: "#458588",
  },
};

const everforestLight: ThemeDef = {
  id: "everforest-light",
  name: "Everforest Light",
  appearance: "light",
  colors: {
    "surface-0": "#fdf6e3",
    "surface-1": "#f3ead3",
    "surface-2": "#e9dfc4",
    "surface-3": "#ddd3b5",
    "surface-4": "#c9c0a8",
    "surface-5": "#a6b0a0",
    "text-primary": "#5c6a72",
    "text-secondary": "#6d7b83",
    "text-tertiary": "#829181",
    "text-muted": "#a6b0a0",
    accent: "#8da101",
    "accent-hover": "#9eb31a",
    "accent-muted": "#8da10122",
    border: "#ddd3b5",
    "border-active": "#c9c0a8",
    danger: "#f85552",
    success: "#8da101",
    info: "#3a94c5",
  },
};

const materialLight: ThemeDef = {
  id: "material-light",
  name: "Material Light",
  appearance: "light",
  colors: {
    "surface-0": "#fafafa",
    "surface-1": "#f5f5f5",
    "surface-2": "#eeeeee",
    "surface-3": "#e0e0e0",
    "surface-4": "#bdbdbd",
    "surface-5": "#9e9e9e",
    "text-primary": "#212121",
    "text-secondary": "#424242",
    "text-tertiary": "#757575",
    "text-muted": "#9e9e9e",
    accent: "#6182b8",
    "accent-hover": "#7490c2",
    "accent-muted": "#6182b822",
    border: "#e0e0e0",
    "border-active": "#bdbdbd",
    danger: "#e53935",
    success: "#91b859",
    info: "#39adb5",
  },
};

// ══════════════════════════════════════
//  Exports
// ══════════════════════════════════════

export const darkThemes: ThemeDef[] = [
  oneDark,
  tokyoNight,
  tokyoNightStorm,
  catppuccinMocha,
  catppuccinMacchiato,
  rosePine,
  rosePineMoon,
  nordDark,
  dracula,
  gruvboxDark,
  solarizedDark,
  everforestDark,
];

export const lightThemes: ThemeDef[] = [
  catppuccinLatte,
  oneLight,
  tokyoNightDay,
  rosePineDawn,
  nordLight,
  githubLight,
  solarizedLight,
  gruvboxLight,
  everforestLight,
  materialLight,
];

export const builtinThemes: ThemeDef[] = [...darkThemes, ...lightThemes];

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
