import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Ticket,
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Keyboard,
  CalendarDays,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AnalyticsStats {
  tickets: {
    total: string;
    open: string;
    resolved: string;
    cancelled: string;
  };
  byStatus: Array<{ status: string; count: string }>;
  byPriority: Array<{ priority: string; count: string }>;
  topCategories: Array<{ category: string | null; count: string }>;
  resources: {
    total: string;
    up: string;
    degraded: string;
    down: string;
  };
  typing: {
    totalSessions: string;
    avgWpm: string | null;
    avgAccuracy: string | null;
  };
}

const statusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_USUARIO: "Aguardando usuário",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

const statusColors: Record<string, string> = {
  ABERTO: "bg-blue-500",
  EM_ANDAMENTO: "bg-amber-500",
  AGUARDANDO_USUARIO: "bg-violet-500",
  AGUARDANDO_APROVACAO: "bg-orange-500",
  RESOLVIDO: "bg-green-500",
  CANCELADO: "bg-red-500",
};

function SectionDivider({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  stripe,
  textColor,
  iconBg,
}: {
  title: string;
  value: string | number | null | undefined;
  icon: React.ComponentType<{ className?: string }>;
  stripe: string;
  textColor: string;
  iconBg: string;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className={cn("h-[3px] w-full", stripe)} />
      <div className="p-5 flex items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-4xl font-bold tracking-tight tabular-nums leading-none",
              textColor,
            )}
          >
            {value ?? "—"}
          </p>
          <p className="text-sm text-muted-foreground mt-2 font-medium">{title}</p>
        </div>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5",
            iconBg,
          )}
        >
          <Icon className={cn("h-4 w-4", textColor)} />
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const statsUrl = `/api/admin/analytics/stats${from || to ? `?${from ? `from=${from}` : ""}${from && to ? "&" : ""}${to ? `to=${to}` : ""}` : ""}`;

  const { data: stats, isLoading: statsLoading } = useQuery<AnalyticsStats>({
    queryKey: [statsUrl],
    queryFn: () =>
      fetch(statsUrl, { credentials: "include" }).then((r) => r.json()),
  });

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header + Date Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-4/10">
            <LineChart className="h-5 w-5 text-chart-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Métricas e painel de TI do portal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-36 h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-36 h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
          {(from || to) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Chamados KPIs */}
      <section>
        <SectionDivider icon={Ticket} label="Chamados" />
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              title="Total"
              value={stats?.tickets.total}
              icon={Ticket}
              stripe="bg-primary"
              textColor="text-foreground"
              iconBg="bg-primary/10"
            />
            <KpiCard
              title="Abertos"
              value={stats?.tickets.open}
              icon={Clock}
              stripe="bg-blue-500"
              textColor="text-blue-600 dark:text-blue-400"
              iconBg="bg-blue-500/10"
            />
            <KpiCard
              title="Resolvidos"
              value={stats?.tickets.resolved}
              icon={CheckCircle2}
              stripe="bg-green-500"
              textColor="text-green-600 dark:text-green-400"
              iconBg="bg-green-500/10"
            />
            <KpiCard
              title="Cancelados"
              value={stats?.tickets.cancelled}
              icon={AlertTriangle}
              stripe="bg-red-500"
              textColor="text-red-600 dark:text-red-400"
              iconBg="bg-red-500/10"
            />
          </div>
        )}
      </section>

      {/* Por Status + Top Categorias */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">Por Status</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            Distribuição dos chamados por status
          </p>
          {statsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-3.5">
              {(stats?.byStatus ?? []).map((row) => {
                const total =
                  parseInt(stats?.tickets.total || "1", 10) || 1;
                const pct = Math.round(
                  (parseInt(row.count, 10) / total) * 100,
                );
                return (
                  <div key={row.status}>
                    <div className="flex justify-between items-baseline text-sm mb-1.5">
                      <span className="font-medium">
                        {statusLabels[row.status] ?? row.status}
                      </span>
                      <span className="text-muted-foreground tabular-nums text-xs">
                        <span className="font-semibold text-foreground text-sm">
                          {row.count}
                        </span>{" "}
                        ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
                          statusColors[row.status] ?? "bg-primary",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {(stats?.byStatus ?? []).length === 0 && (
                <p className="text-muted-foreground text-sm py-6 text-center">
                  Sem dados
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">Top Categorias</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            Categorias mais utilizadas
          </p>
          {statsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-3">
              {(stats?.topCategories ?? []).slice(0, 8).map((row, i) => {
                const maxCount =
                  parseInt(
                    (stats?.topCategories ?? [])[0]?.count ?? "1",
                    10,
                  ) || 1;
                const pct = Math.round(
                  (parseInt(row.count, 10) / maxCount) * 100,
                );
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold bg-muted text-muted-foreground shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium truncate">
                          {row.category ?? "Sem categoria"}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums ml-2 shrink-0">
                          {row.count}
                        </span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/50 transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {(stats?.topCategories ?? []).length === 0 && (
                <p className="text-muted-foreground text-sm py-6 text-center">
                  Sem dados
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Saúde dos Recursos + Digitação */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Saúde dos Recursos</h3>
          </div>
          {statsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-center">
                <div className="h-2 w-2 rounded-full bg-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">
                  {stats?.resources.up ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">OK</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-center">
                <div className="h-2 w-2 rounded-full bg-amber-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {stats?.resources.degraded ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Degradado
                </p>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-center">
                <div className="h-2 w-2 rounded-full bg-red-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                  {stats?.resources.down ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fora do ar
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Digitação</h3>
          </div>
          {statsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid grid-cols-3 divide-x">
              <div className="text-center px-3 first:pl-0">
                <p className="text-3xl font-bold tabular-nums">
                  {stats?.typing.totalSessions ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Sessões</p>
              </div>
              <div className="text-center px-3">
                <p className="text-3xl font-bold tabular-nums">
                  {stats?.typing.avgWpm ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">WPM médio</p>
              </div>
              <div className="text-center px-3 last:pr-0">
                <p className="text-3xl font-bold tabular-nums">
                  {stats?.typing.avgAccuracy
                    ? `${stats.typing.avgAccuracy}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Precisão</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
