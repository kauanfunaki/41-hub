import { useTheme } from "@/lib/theme-provider";

/**
 * ThemeToggle v2 — adapted from Uiverse "jolly-chicken-91" (RiccardoRapelli, MIT).
 * Sun (light mode) ←→ Moon + stars (dark mode), with cloud and star animations.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <label className="ts2-switch" aria-label="Alternar tema">
      <input
        className="ts2-input"
        type="checkbox"
        checked={theme === "dark"}
        onChange={toggleTheme}
        data-testid="button-theme-toggle"
      />
      <div className="ts2-slider ts2-round">
        {/* Knob: yellow sun → white moon */}
        <div className="ts2-sun-moon">
          {/* Moon craters */}
          <svg id="moon-dot-1" className="ts2-moon-dot" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          <svg id="moon-dot-2" className="ts2-moon-dot" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          <svg id="moon-dot-3" className="ts2-moon-dot" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          {/* Sun light rays */}
          <svg id="light-ray-1" className="ts2-light-ray" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          <svg id="light-ray-2" className="ts2-light-ray" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          <svg id="light-ray-3" className="ts2-light-ray" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          {/* Clouds (dark shadow) */}
          <svg id="cloud-1" className="ts2-cloud-dark" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          <svg id="cloud-2" className="ts2-cloud-dark" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          <svg id="cloud-3" className="ts2-cloud-dark" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          {/* Clouds (light highlight) */}
          <svg id="cloud-4" className="ts2-cloud-light" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          <svg id="cloud-5" className="ts2-cloud-light" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
          <svg id="cloud-6" className="ts2-cloud-light" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" />
          </svg>
        </div>

        {/* Stars — slide in when dark mode is active */}
        <div className="ts2-stars">
          <svg id="star-1" className="ts2-star" viewBox="0 0 20 20">
            <path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" />
          </svg>
          <svg id="star-2" className="ts2-star" viewBox="0 0 20 20">
            <path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" />
          </svg>
          <svg id="star-3" className="ts2-star" viewBox="0 0 20 20">
            <path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" />
          </svg>
          <svg id="star-4" className="ts2-star" viewBox="0 0 20 20">
            <path d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z" />
          </svg>
        </div>
      </div>
    </label>
  );
}
