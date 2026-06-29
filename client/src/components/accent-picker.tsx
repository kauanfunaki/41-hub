import { Check, Palette } from "lucide-react";
import { ACCENT_PRESETS, useTheme } from "@/lib/theme-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Seletor de cor de destaque (estilo Slack). Troca apenas o matiz do accent
 * via --accent-hue; o resto da paleta (incluindo a logo, que é PNG) fica intacto.
 */
export function AccentPicker() {
  const { accentHue, setAccentHue } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Cor do tema"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-accent transition-colors"
          data-testid="button-accent-picker"
        >
          <Palette className="h-4 w-4" style={{ color: `hsl(${accentHue} 85% 50%)` }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Cor do tema</p>
        <div className="grid grid-cols-4 gap-2">
          {ACCENT_PRESETS.map((preset) => {
            const selected = preset.hue === accentHue;
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                onClick={() => setAccentHue(preset.hue)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110",
                  selected && "ring-2 ring-offset-2 ring-offset-background ring-foreground/40",
                )}
                style={{ backgroundColor: `hsl(${preset.hue} 85% 50%)` }}
                data-testid={`accent-option-${preset.id}`}
              >
                {selected && <Check className="h-4 w-4 text-white" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
