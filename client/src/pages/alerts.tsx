import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { PageContainer } from "@/components/page-container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EmptyState } from "@/components/empty-state";
import { SeverityBadge, SEVERITY_CONFIG } from "@/components/severity-badge";
import type { AlertSeverity } from "@/components/severity-badge";
import { cn } from "@/lib/utils";

interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  isActive: boolean;
  createdAt: string;
  createdByName: string | null;
  isRead?: boolean;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(d));
}

export default function Alerts() {
  const { toast } = useToast();

  const { data: alertsRaw, isLoading } = useQuery<AlertItem[] | unknown>({
    queryKey: ["/api/alerts"],
    queryFn: () =>
      fetch("/api/alerts?active=true", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    retry: false,
  });
  const alerts: AlertItem[] = Array.isArray(alertsRaw) ? alertsRaw : [];

  const { data: historyRaw } = useQuery<AlertItem[] | unknown>({
    queryKey: ["/api/alerts/history"],
    queryFn: () =>
      fetch("/api/alerts?active=false", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    retry: false,
  });
  const history: AlertItem[] = Array.isArray(historyRaw) ? (historyRaw as AlertItem[]).slice(0, 5) : [];

  const readMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/alerts/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alerta marcado como lido" });
    },
    onError: () =>
      toast({ title: "Erro ao marcar alerta", variant: "destructive" }),
  });

  return (
    <PageContainer className="flex flex-col gap-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
          <Bell className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Alertas</h1>
          <p className="text-sm text-muted-foreground">
            Avisos e comunicados do sistema
          </p>
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border bg-card overflow-hidden flex items-stretch"
            >
              <div className="w-1 shrink-0 bg-muted" />
              <div className="flex items-start gap-4 p-4 flex-1">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-4 w-24 rounded" />
                  </div>
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhum alerta ativo"
          description="Tudo em ordem! Não há alertas no momento."
        />
      ) : (
        <div className="space-y-2" data-tutorial="alerts-list">
          {alerts.map((alert) => {
            const cfg =
              SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
            const SevIcon = cfg.icon;
            return (
              <div
                key={alert.id}
                className={cn(
                  "flex items-stretch rounded-xl border bg-card overflow-hidden",
                  alert.isRead && "opacity-60",
                )}
              >
                {/* Severity stripe */}
                <div className={`w-1 shrink-0 ${cfg.stripe}`} />

                <div className="flex items-start gap-4 p-4 flex-1 min-w-0">
                  {/* Severity icon */}
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${cfg.iconBg}`}
                  >
                    <SevIcon className={`h-5 w-5 ${cfg.iconColor}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <SeverityBadge severity={alert.severity} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(alert.createdAt)}
                      </span>
                      {alert.createdByName && (
                        <span className="text-xs text-muted-foreground">
                          por {alert.createdByName}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-sm leading-snug">
                      {alert.title}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {alert.message}
                    </p>
                  </div>

                  {/* Mark as read */}
                  {!alert.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-8 text-xs"
                      disabled={readMutation.isPending}
                      onClick={() => readMutation.mutate(alert.id)}
                    >
                      {readMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      )}
                      Marcar lido
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Histórico de alertas encerrados */}
      {history.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Histórico recente
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-2 opacity-60">
            {history.map((alert) => {
              const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
              const SevIcon = cfg.icon;
              return (
                <div
                  key={alert.id}
                  className="flex items-stretch rounded-xl border bg-card overflow-hidden"
                >
                  <div className={`w-1 shrink-0 ${cfg.stripe}`} />
                  <div className="flex items-center gap-3 p-3 flex-1 min-w-0">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${cfg.iconBg}`}>
                      <SevIcon className={`h-4 w-4 ${cfg.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(alert.createdAt)}</p>
                    </div>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
