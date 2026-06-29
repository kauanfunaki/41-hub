import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

/** Temas de cor (estilo Slack). "Padrão" mantém a sidebar cinza-neutra; os
 *  demais recolorem a sidebar inteira com um tom escuro/saturado da cor, além
 *  do accent dos botões. A saturação/luminosidade da sidebar é a mesma nos dois
 *  modos de conteúdo (claro/escuro) — só o conteúdo segue o claro/escuro. */
export const THEME_PRESETS: { id: string; label: string; hue: number; colored: boolean }[] = [
  { id: "default", label: "Padrão", hue: 210, colored: false },
  { id: "blue", label: "Azul", hue: 210, colored: true },
  { id: "indigo", label: "Índigo", hue: 235, colored: true },
  { id: "violet", label: "Roxo", hue: 265, colored: true },
  { id: "pink", label: "Rosa", hue: 320, colored: true },
  { id: "red", label: "Vermelho", hue: 355, colored: true },
  { id: "orange", label: "Laranja", hue: 25, colored: true },
  { id: "green", label: "Verde", hue: 150, colored: true },
  { id: "teal", label: "Teal", hue: 185, colored: true },
];

const SIDEBAR_VARS = [
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-border",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
];

type ThemeProviderContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  accentId: string;
  setAccentId: (id: string) => void;
  accentColored: boolean;
};

const ThemeProviderContext = createContext<ThemeProviderContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  accentStorageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "41hub-theme",
  accentStorageKey = "41hub-accent",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey) as Theme;
      return stored || defaultTheme;
    }
    return defaultTheme;
  });

  const [accentId, setAccentIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(accentStorageKey);
      if (stored && THEME_PRESETS.some((p) => p.id === stored)) return stored;
    }
    return "default";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem(storageKey, theme);
    window.dispatchEvent(new CustomEvent("hub-theme-change", { detail: { theme } }));
  }, [theme, storageKey]);

  useEffect(() => {
    const preset = THEME_PRESETS.find((p) => p.id === accentId) ?? THEME_PRESETS[0];
    const s = document.documentElement.style;
    // Accent dos botões/conteúdo (--primary etc. usam var(--accent-hue) no CSS).
    s.setProperty("--accent-hue", String(preset.hue));

    if (preset.colored) {
      const h = preset.hue;
      // Sidebar colorida: fundo escuro/saturado + texto claro. Mesmos valores
      // nos dois modos de conteúdo (a sidebar é sempre escura, estilo Slack).
      s.setProperty("--sidebar", `${h} 42% 16%`);
      s.setProperty("--sidebar-foreground", `${h} 25% 88%`);
      s.setProperty("--sidebar-border", `${h} 30% 24%`);
      // Hover e item ativo usam --sidebar-accent (ver ui/sidebar): realce visível.
      s.setProperty("--sidebar-accent", `${h} 50% 38%`);
      s.setProperty("--sidebar-accent-foreground", `0 0% 100%`);
      s.setProperty("--sidebar-primary", `${h} 65% 50%`);
      s.setProperty("--sidebar-primary-foreground", `0 0% 100%`);
      s.setProperty("--sidebar-ring", `${h} 65% 55%`);
    } else {
      // Padrão: remove overrides → volta ao cinza-neutro definido em index.css.
      SIDEBAR_VARS.forEach((v) => s.removeProperty(v));
    }

    localStorage.setItem(accentStorageKey, accentId);
  }, [accentId, accentStorageKey]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setAccentId = (id: string) => {
    setAccentIdState(id);
  };

  const accentColored = (THEME_PRESETS.find((p) => p.id === accentId) ?? THEME_PRESETS[0]).colored;

  return (
    <ThemeProviderContext.Provider
      value={{ theme, setTheme, toggleTheme, accentId, setAccentId, accentColored }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
