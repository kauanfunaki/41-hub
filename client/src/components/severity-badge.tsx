import { Info, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AlertSeverity = "info" | "warning" | "critical";

/**
 * Configuração centralizada de severidade de alerta.
 * Usado em: alerts.tsx, admin-alerts.tsx, home.tsx
 */
export const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    label: string;
    icon: LucideIcon;
    iconColor: string;
    iconBg: string;
    stripe: string;
    badgeClass: string;
  }
> = {
  info: {
    label: "Informação",
    icon: Info,
    iconColor: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-500/10",
    stripe: "bg-blue-500",
    badgeClass:
      "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  warning: {
    label: "Atenção",
    icon: AlertTriangle,
    iconColor: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10",
    stripe: "bg-amber-500",
    badgeClass:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  critical: {
    label: "Crítico",
    icon: AlertTriangle,
    iconColor: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-500/10",
    stripe: "bg-red-500",
    badgeClass:
      "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
};

/**
 * Badge de severidade padronizado (padrão transparente com borda).
 */
export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
}
