import { Check, Palette, Ban } from "lucide-react";
import { THEME_PRESETS, useTheme } from "@/lib/theme-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Seletor de tema de cor (estilo Slack). "Padrão" mantém a sidebar neutra; as
 * cores recolorem a sidebar inteira. A logo é PNG e troca de variante conforme
 * a sidebar, então nunca quebra.
 */
export function AccentPicker() {
  const { accentId, setAccentId, accentColored } = useTheme();
  const current = THEME_PRESETS.find((p) => p.id === accentId) ?? THEME_PRESETS[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Cor do tema"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-accent transition-colors"
          data-testid="button-accent-picker"
        >
          <Palette
            className="h-4 w-4"
            style={{ color: accentColored ? `hsl(${current.hue} 75% 50%)` : undefined }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Cor do tema</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_PRESETS.map((preset) => {
            const selected = preset.id === accentId;
            const isDefault = !preset.colored;
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                onClick={() => setAccentId(preset.id)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110",
                  isDefault && "border border-border bg-muted text-muted-foreground",
                  selected && "ring-2 ring-offset-2 ring-offset-background ring-foreground/40",
                )}
                style={isDefault ? undefined : { backgroundColor: `hsl(${preset.hue} 55% 38%)` }}
                data-testid={`accent-option-${preset.id}`}
              >
                {selected ? (
                  <Check className={cn("h-4 w-4", isDefault ? "text-foreground" : "text-white")} />
                ) : isDefault ? (
                  <Ban className="h-3.5 w-3.5" />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
