import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

/** Cores de destaque disponíveis (estilo Slack). Só o matiz muda; a
 *  saturação/luminosidade vêm do tema em index.css, então o contraste do
 *  texto sobre o accent permanece garantido. A logo é PNG e NÃO depende
 *  do accent, então nunca é afetada. */
export const ACCENT_PRESETS: { id: string; label: string; hue: number }[] = [
  { id: "blue", label: "Azul", hue: 210 },
  { id: "indigo", label: "Índigo", hue: 235 },
  { id: "violet", label: "Roxo", hue: 265 },
  { id: "pink", label: "Rosa", hue: 320 },
  { id: "red", label: "Vermelho", hue: 355 },
  { id: "orange", label: "Laranja", hue: 25 },
  { id: "green", label: "Verde", hue: 150 },
  { id: "teal", label: "Teal", hue: 185 },
];

const DEFAULT_HUE = 210;

type ThemeProviderContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  accentHue: number;
  setAccentHue: (hue: number) => void;
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

  const [accentHue, setAccentHueState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = Number(localStorage.getItem(accentStorageKey));
      return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_HUE;
    }
    return DEFAULT_HUE;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem(storageKey, theme);
    window.dispatchEvent(new CustomEvent("hub-theme-change", { detail: { theme } }));
  }, [theme, storageKey]);

  useEffect(() => {
    // Só o matiz é dinâmico; sobrescreve --accent-hue, que index.css usa nas
    // variáveis de accent (--primary, --ring, --sidebar-primary, --sidebar-ring).
    document.documentElement.style.setProperty("--accent-hue", String(accentHue));
    localStorage.setItem(accentStorageKey, String(accentHue));
  }, [accentHue, accentStorageKey]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setAccentHue = (hue: number) => {
    setAccentHueState(hue);
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme, toggleTheme, accentHue, setAccentHue }}>
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
