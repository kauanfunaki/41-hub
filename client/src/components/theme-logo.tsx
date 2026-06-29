import { useTheme } from "@/lib/theme-provider";

interface ThemeLogoProps {
  className?: string;
  alt?: string;
  /** Força a variante branca (ex: sobre a sidebar colorida/escura). */
  forceWhite?: boolean;
}

export function ThemeLogo({ className = "h-8 w-auto", alt = "41 Tech", forceWhite = false }: ThemeLogoProps) {
  const { theme } = useTheme();
  const useWhite = forceWhite || theme === "dark";
  const logoSrc = useWhite ? "/41tech-logo-white.png" : "/41tech-logo.png";

  return (
    <img
      src={logoSrc}
      alt={alt}
      className={className}
    />
  );
}
