import { useEffect, useState } from "react";
import { ThemeLogo } from "@/components/theme-logo";

export function LoginLoadingScreen() {
  // Segura a animação em "paused" até o browser ter pintado o frame inicial.
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setPlaying(true));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const playState = playing ? "running" : "paused";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-8">
      <ThemeLogo className="h-10 w-auto opacity-90" />

      {/* Bouncing balls */}
      <div style={{ width: 200, height: 60, position: "relative", zIndex: 1 }}>
        {/* Circles */}
        {[0, 1, 2].map((i) => (
          <div
            key={`circle-${i}`}
            style={{
              width: 20,
              height: 20,
              position: "absolute",
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              left: i === 2 ? "auto" : i === 0 ? "15%" : "45%",
              right: i === 2 ? "15%" : "auto",
              transformOrigin: "50%",
              willChange: "top, height, transform",
              animation: "circle7124 0.5s alternate infinite ease",
              animationDelay: i === 0 ? "0s" : i === 1 ? "0.2s" : "0.3s",
              animationPlayState: playState,
            }}
          />
        ))}

        {/* Shadows */}
        {[0, 1, 2].map((i) => (
          <div
            key={`shadow-${i}`}
            style={{
              width: 20,
              height: 4,
              borderRadius: "50%",
              backgroundColor: "hsl(var(--foreground) / 0.25)",
              position: "absolute",
              top: 62,
              transformOrigin: "50%",
              zIndex: -1,
              left: i === 2 ? "auto" : i === 0 ? "15%" : "45%",
              right: i === 2 ? "15%" : "auto",
              filter: "blur(1px)",
              willChange: "transform",
              animation: "shadow046 0.5s alternate infinite ease",
              animationDelay: i === 0 ? "0s" : i === 1 ? "0.2s" : "0.3s",
              animationPlayState: playState,
            }}
          />
        ))}
      </div>

      <p className="text-sm text-muted-foreground tracking-wide">
        Entrando no Hub...
      </p>
    </div>
  );
}
