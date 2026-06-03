import { useTheme } from "@/lib/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <label className="theme-switch" aria-label="Alternar tema">
      <input
        type="checkbox"
        checked={theme === "dark"}
        onChange={toggleTheme}
        data-testid="button-theme-toggle"
      />
      <span className="ts-slider">
        {/* Sol — visível no modo claro (thumb cobre a lua) */}
        <span className="ts-sun">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" fill="#F59E0B" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        </span>
        {/* Lua — visível no modo escuro (thumb cobre o sol) */}
        <span className="ts-moon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </span>
      </span>
    </label>
  );
}
