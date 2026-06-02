import { cn } from "@/lib/utils";

interface SectionDividerProps {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

/**
 * Separador de seção padronizado.
 * Uso: <SectionDivider icon={Bell} label="Alertas Ativos" />
 */
export function SectionDivider({ label, icon: Icon, className }: SectionDividerProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {Icon && (
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
