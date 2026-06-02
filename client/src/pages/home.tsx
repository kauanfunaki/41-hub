import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  LayoutGrid,
  BarChart3,
  Ticket,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Star,
  Clock,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RecentAccessSection } from "@/components/recent-access-section";
import { ResourceCard } from "@/components/resource-card";
import { SectionDivider } from "@/components/section-divider";
import { SeverityBadge, SEVERITY_CONFIG } from "@/components/severity-badge";
import type { AlertSeverity } from "@/components/severity-badge";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { ResourceWithHealth } from "@shared/schema";

interface TicketStats {
  open: string;
  resolved: string;
  total: string;
}

interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  isRead: boolean;
  createdAt: string;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  stripe,
  iconBg,
  iconColor,
  onClick,
  warning,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  stripe: string;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden",
        onClick && "cursor-pointer hover:bg-accent transition-colors",
        warning && "border-amber-500/30 bg-amber-500/5",
      )}
      onClick={onClick}
    >
      <div className={cn("h-[3px] w-full", stripe)} />
      <div className="p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-bold tabular-nums tracking-tight leading-none">
            {value}
          </p>
          <p className="text-sm text-muted-foreground mt-2">{label}</p>
        </div>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5",
            iconBg,
          )}
        >
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: resources = [], isLoading: resourcesLoading } = useQuery<
    ResourceWithHealth[]
  >({ queryKey: ["/api/resources"] });

  const { data: recentResources = [], isLoading: recentLoading } = useQuery<
    ResourceWithHealth[]
  >({ queryKey: ["/api/resources/recent"] });

  const { data: ticketStats } = useQuery<{ tickets: TicketStats }>({
    queryKey: ["/api/admin/analytics/stats"],
    enabled: user?.isAdmin === true,
  });

  const { data: alertsRaw } = useQuery<AlertItem[] | { error: string }>({
    queryKey: ["/api/alerts?active=true"],
    queryFn: () =>
      fetch("/api/alerts?active=true", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    retry: false,
  });
  const alerts: AlertItem[] = Array.isArray(alertsRaw) ? alertsRaw : [];

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({
      resourceId,
      isFavorite,
    }: {
      resourceId: string;
      isFavorite: boolean;
    }) => {
      if (isFavorite) {
        return apiRequest("POST", `/api/favorites/${resourceId}`);
      } else {
        return apiRequest("DELETE", `/api/favorites/${resourceId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    },
  });

  const safeResources = Array.isArray(resources) ? resources : [];
  const favoriteResources = safeResources.filter((r) => r.isFavorite);
  const resourcesDown = safeResources.filter(
    (r) => r.healthStatus === "DOWN",
  ).length;
  const resourcesDegraded = safeResources.filter(
    (r) => r.healthStatus === "DEGRADED",
  ).length;
  const activeAlerts = alerts.filter((a) => !a.isRead);
  const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical");

  const handleOpenResource = (resource: ResourceWithHealth) => {
    setLocation(`/resource/${resource.id}`);
  };

  const handleToggleFavorite = (resourceId: string, isFavorite: boolean) => {
    toggleFavoriteMutation.mutate({ resourceId, isFavorite });
  };

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Olá, {user?.name?.split(" ")[0] || "Usuário"} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bem-vindo ao portal corporativo 41 Tech
        </p>
      </div>

      {/* Critical alerts banner */}
      {criticalAlerts.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 cursor-pointer hover:bg-red-500/8 transition-colors"
          onClick={() => setLocation("/alerts")}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-red-700 dark:text-red-400">
              {criticalAlerts.length} alerta
              {criticalAlerts.length !== 1 ? "s" : ""} crítico
              {criticalAlerts.length !== 1 ? "s" : ""} ativo
              {criticalAlerts.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {criticalAlerts[0].title}
            </p>
          </div>
          <SeverityBadge severity="critical" />
        </div>
      )}

      {/* ── Recursos KPIs ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionDivider icon={Activity} label="Visão Geral" />
        {resourcesLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card overflow-hidden">
                <div className="h-[3px] bg-muted w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label="Aplicações"
              value={safeResources.filter((r) => r.type === "APP").length}
              icon={LayoutGrid}
              stripe="bg-primary"
              iconBg="bg-primary/10"
              iconColor="text-primary"
              onClick={() => setLocation("/apps")}
            />
            <KpiCard
              label="Dashboards"
              value={safeResources.filter((r) => r.type === "DASHBOARD").length}
              icon={BarChart3}
              stripe="bg-chart-2"
              iconBg="bg-chart-2/10"
              iconColor="text-chart-2"
              onClick={() => setLocation("/dashboards")}
            />
            <KpiCard
              label="Alertas ativos"
              value={activeAlerts.length}
              icon={Bell}
              stripe="bg-amber-500"
              iconBg="bg-amber-500/10"
              iconColor="text-amber-500"
              onClick={() => setLocation("/alerts")}
            />
            {resourcesDown + resourcesDegraded > 0 ? (
              <KpiCard
                label="Recursos c/ problema"
                value={resourcesDown + resourcesDegraded}
                icon={Activity}
                stripe="bg-amber-500"
                iconBg="bg-amber-500/10"
                iconColor="text-amber-500"
                warning
              />
            ) : (
              <KpiCard
                label="Recursos OK"
                value={safeResources.length}
                icon={CheckCircle2}
                stripe="bg-green-500"
                iconBg="bg-green-500/10"
                iconColor="text-green-600 dark:text-green-400"
              />
            )}
          </div>
        )}
      </section>

      {/* ── Admin: Chamados ───────────────────────────────────────── */}
      {user?.isAdmin && ticketStats && (
        <section className="space-y-3">
          <SectionDivider icon={Ticket} label="Chamados" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Chamados abertos"
              value={ticketStats.tickets?.open ?? "—"}
              icon={Ticket}
              stripe="bg-blue-500"
              iconBg="bg-blue-500/10"
              iconColor="text-blue-500"
              onClick={() => setLocation("/tickets")}
            />
            <KpiCard
              label="Resolvidos"
              value={ticketStats.tickets?.resolved ?? "—"}
              icon={CheckCircle2}
              stripe="bg-green-500"
              iconBg="bg-green-500/10"
              iconColor="text-green-600 dark:text-green-400"
              onClick={() => setLocation("/tickets")}
            />
            <KpiCard
              label="Total de chamados"
              value={ticketStats.tickets?.total ?? "—"}
              icon={Clock}
              stripe="bg-muted-foreground/30"
              iconBg="bg-muted"
              iconColor="text-muted-foreground"
              onClick={() => setLocation("/tickets")}
            />
          </div>
        </section>
      )}

      {/* ── Alertas Ativos ────────────────────────────────────────── */}
      {activeAlerts.length > 0 && (
        <section className="space-y-3">
          <SectionDivider
            icon={Bell}
            label={`Alertas Ativos (${activeAlerts.length})`}
          />
          <div className="space-y-2">
            {activeAlerts.slice(0, 3).map((alert) => {
              const cfg =
                SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
              const SevIcon = cfg.icon;
              return (
                <div
                  key={alert.id}
                  className="flex items-stretch rounded-xl border bg-card overflow-hidden cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => setLocation("/alerts")}
                >
                  <div className={`w-1 shrink-0 ${cfg.stripe}`} />
                  <div className="flex items-center gap-3 p-3 flex-1 min-w-0">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${cfg.iconBg}`}
                    >
                      <SevIcon className={`h-4 w-4 ${cfg.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <SeverityBadge severity={alert.severity} />
                      </div>
                      <p className="text-sm font-semibold truncate leading-tight">
                        {alert.title}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {activeAlerts.length > 3 && (
              <button
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 hover:underline transition-colors"
                onClick={() => setLocation("/alerts")}
              >
                Ver mais {activeAlerts.length - 3} alerta
                {activeAlerts.length - 3 !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Favoritos ─────────────────────────────────────────────── */}
      {favoriteResources.length > 0 && (
        <section className="space-y-3">
          <SectionDivider icon={Star} label="Favoritos" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favoriteResources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onOpen={handleOpenResource}
                onToggleFavorite={handleToggleFavorite}
                isAdmin={user?.isAdmin === true}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Recentes ──────────────────────────────────────────────── */}
      <RecentAccessSection
        resources={recentResources}
        isLoading={recentLoading}
        onOpen={handleOpenResource}
      />
    </div>
  );
}
