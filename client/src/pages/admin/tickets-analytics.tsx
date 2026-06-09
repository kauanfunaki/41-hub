import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, BarChart2, CalendarDays, X, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Sector, UserWithRoles } from "@shared/schema";
import { Users } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface TicketRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  closedAt: string | null;
  targetSector: string;
  category: string | null;
  resolutionMinutes: number | null;
  assignees: string;
  firstResponseBreached: boolean | null;
  resolutionBreached: boolean | null;
  resolutionDueAt: string | null;
}

interface CategoryStat {
  category: string | null;
  total: string;
  breached: string;
  avgResolutionMinutes: number | null;
}

interface DetailResponse {
  tickets: TicketRow[];
  total: number;
  page: number;
  limit: number;
  summary: { total: string; breached: string; avgResolutionMinutes: number | null };
  byCategory: CategoryStat[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ABERTO: "Aberto",
  NA_FILA: "Na fila",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_USUARIO: "Aguard. usuário",
  AGUARDANDO_APROVACAO: "Aguard. aprovação",
  AGUARDANDO_REQUERENTE: "Aguard. usuário",
  STANDBY: "Em pausa",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  ABERTO: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  NA_FILA: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  EM_ANDAMENTO: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  AGUARDANDO_USUARIO: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  AGUARDANDO_APROVACAO: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  AGUARDANDO_REQUERENTE: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  STANDBY: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
  RESOLVIDO: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  CANCELADO: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

const PRIORITY_LABEL: Record<string, string> = {
  BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente",
};

const PRIORITY_COLOR: Record<string, string> = {
  BAIXA: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  MEDIA: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  ALTA: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  URGENTE: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(iso));
}

function fmtDuration(minutes: number | null) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function buildUrl(base: string, params: Record<string, string | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return q ? `${base}?${q}` : base;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  title, value, sub, icon: Icon, color,
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className={cn("h-[3px]", color)} />
      <div className="p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
          <p className="text-sm text-muted-foreground mt-1.5">{title}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", `${color.replace("bg-", "bg-")}/10`)}>
          <Icon className={cn("h-4 w-4", color.replace("bg-", "text-"))} />
        </div>
      </div>
    </div>
  );
}

function CategoryBreachChart({ data }: { data: CategoryStat[] }) {
  const maxTotal = Math.max(...data.map((d) => parseInt(d.total, 10)), 1);
  return (
    <div className="space-y-3">
      {data.slice(0, 10).map((row, i) => {
        const total = parseInt(row.total, 10);
        const breached = parseInt(row.breached, 10);
        const breachPct = total > 0 ? Math.round((breached / total) * 100) : 0;
        const barPct = Math.round((total / maxTotal) * 100);
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium truncate flex-1 mr-2">{row.category ?? "Sem categoria"}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-muted-foreground">{total} tickets</span>
                {breachPct > 0 && (
                  <span className={cn("font-semibold", breachPct >= 50 ? "text-red-500" : "text-amber-500")}>
                    {breachPct}% breach
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-0.5 h-2 w-full rounded-full overflow-hidden bg-muted">
              <div
                className={cn("h-full rounded-full transition-all duration-700",
                  breachPct >= 50 ? "bg-red-500" : breachPct > 0 ? "bg-amber-500" : "bg-primary/60"
                )}
                style={{ width: `${barPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminTicketsAnalytics() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [priority, setPriority] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [page, setPage] = useState(1);

  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/admin/sectors"],
  });

  const { data: allUsers = [] } = useQuery<UserWithRoles[]>({
    queryKey: ["/api/admin/users"],
  });
  // Only show tech team members (admins + coordinators) as assignee options
  const techUsers = allUsers.filter(
    (u) => u.isActive && (u.isAdmin || u.roles?.some((r) => r.roleName === "Coordenador"))
  );

  const apiUrl = useMemo(() => buildUrl("/api/admin/analytics/tickets-detail", {
    from: from || undefined,
    to: to || undefined,
    sectorId: sectorId || undefined,
    priority: priority || undefined,
    assigneeId: assigneeId || undefined,
    page: String(page),
    limit: "25",
  }), [from, to, sectorId, priority, assigneeId, page]);

  const { data, isLoading } = useQuery<DetailResponse>({
    queryKey: [apiUrl],
    queryFn: () => fetch(apiUrl, { credentials: "include" }).then((r) => r.json()),
  });

  const hasFilters = from || to || sectorId || priority || assigneeId;

  function clearFilters() {
    setFrom(""); setTo(""); setSectorId(""); setPriority(""); setAssigneeId(""); setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / 25) : 1;

  const summaryTotal = parseInt(data?.summary?.total ?? "0", 10);
  const summaryBreached = parseInt(data?.summary?.breached ?? "0", 10);
  const breachRate = summaryTotal > 0 ? Math.round((summaryBreached / summaryTotal) * 100) : 0;
  const onTimeCount = summaryTotal - summaryBreached;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/analytics">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-4/10">
          <BarChart2 className="h-5 w-5 text-chart-4" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Analytics de Chamados</h1>
          <p className="text-sm text-muted-foreground">SLA individual, breach por categoria e tempo médio</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="w-34 h-8 text-xs [color-scheme:light] dark:[color-scheme:dark]"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="w-34 h-8 text-xs [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <Select value={sectorId} onValueChange={(v) => { setSectorId(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Setor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos os setores</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => { setPriority(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todas as prioridades</SelectItem>
            <SelectItem value="BAIXA">Baixa</SelectItem>
            <SelectItem value="MEDIA">Média</SelectItem>
            <SelectItem value="ALTA">Alta</SelectItem>
            <SelectItem value="URGENTE">Urgente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assigneeId} onValueChange={(v) => { setAssigneeId(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Colaborador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos os colaboradores</SelectItem>
            {techUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}
        {data && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {data.total} chamado{data.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <MetricCard
              title="Total de chamados"
              value={summaryTotal}
              icon={BarChart2}
              color="bg-primary"
            />
            <MetricCard
              title="Dentro do SLA"
              value={onTimeCount}
              sub={summaryTotal > 0 ? `${100 - breachRate}% de conformidade` : undefined}
              icon={CheckCircle2}
              color="bg-green-500"
            />
            <MetricCard
              title="Breach de SLA"
              value={summaryBreached}
              sub={summaryTotal > 0 ? `${breachRate}% dos chamados` : undefined}
              icon={AlertTriangle}
              color="bg-red-500"
            />
            <MetricCard
              title="Tempo médio"
              value={fmtDuration(data?.summary?.avgResolutionMinutes ?? null)}
              sub="de resolução"
              icon={Clock}
              color="bg-amber-500"
            />
          </>
        )}
      </div>

      {/* Main content */}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[260px]">Chamado</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Resolução</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (data?.tickets ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-16 text-center text-muted-foreground text-sm">
                      Nenhum chamado encontrado com os filtros selecionados
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.tickets ?? []).map((t) => {
                    const breached = t.resolutionBreached === true;
                    const onTime = t.resolutionBreached === false;
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate max-w-[260px]">{t.title}</p>
                            {t.category && (
                              <p className="text-xs text-muted-foreground truncate">{t.category}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {t.targetSector}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px]">
                          {t.assignees && t.assignees !== "—" ? (
                            <span className="truncate block" title={t.assignees}>{t.assignees}</span>
                          ) : (
                            <span className="opacity-40">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium", PRIORITY_COLOR[t.priority] ?? "")}>
                            {PRIORITY_LABEL[t.priority] ?? t.priority}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium", STATUS_COLOR[t.status] ?? "")}>
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {t.resolutionBreached === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : breached ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                              <AlertTriangle className="h-3 w-3" /> Breach
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-3 w-3" /> OK
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          {fmtDuration(t.resolutionMinutes)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(t.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Right panel — breach by category */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Breach por Categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (data?.byCategory ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
              ) : (
                <CategoryBreachChart data={data!.byCategory} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Tempo Médio por Categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
                </div>
              ) : (data?.byCategory ?? []).filter((c) => c.avgResolutionMinutes !== null).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
              ) : (
                <div className="space-y-3">
                  {(data?.byCategory ?? [])
                    .filter((c) => c.avgResolutionMinutes !== null)
                    .sort((a, b) => (b.avgResolutionMinutes ?? 0) - (a.avgResolutionMinutes ?? 0))
                    .slice(0, 8)
                    .map((row, i) => {
                      const maxMin = Math.max(
                        ...(data?.byCategory ?? []).map((c) => c.avgResolutionMinutes ?? 0), 1
                      );
                      const pct = Math.round(((row.avgResolutionMinutes ?? 0) / maxMin) * 100);
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium truncate flex-1 mr-2">{row.category ?? "Sem categoria"}</span>
                            <span className="text-muted-foreground shrink-0">{fmtDuration(row.avgResolutionMinutes)}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500/60 transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
