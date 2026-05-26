import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Copy,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ────────────────────────────────────────────────────────────────────

interface OpsSummary {
  total: number;
  success: number;
  error: number;
  warning: number;
  successRate: number | null;
}

interface OpsWatcher {
  slug: string;
  name: string;
  description: string | null;
  client: string | null;
  isActive: boolean;
  folderInput: string | null;
  folderOutput: string | null;
  lastHeartbeatAt: string | null;
  lastStatus: "SUCCESS" | "ERROR" | "WARNING" | null;
  lastProcessedAt: string | null;
  lastFilename: string | null;
  lastErrorMessage: string | null;
  totalToday: string;
  successToday: string;
  errorToday: string;
}

interface OpsEvent {
  id: string;
  watcherSlug: string;
  watcherName: string;
  filename: string;
  filenameRenamed: string | null;
  status: "SUCCESS" | "ERROR" | "WARNING";
  errorMessage: string | null;
  client: string | null;
  processedAt: string;
}

interface OpsEventsResponse {
  events: OpsEvent[];
  total: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const REFETCH_INTERVAL = 30_000;
const PAGE_SIZE = 50;

function statusBadge(status: "SUCCESS" | "ERROR" | "WARNING" | null) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const map = {
    SUCCESS: { label: "Sucesso",  className: "bg-green-500/10 text-green-600 border-green-200" },
    ERROR:   { label: "Erro",     className: "bg-red-500/10 text-red-600 border-red-200" },
    WARNING: { label: "Aviso",    className: "bg-amber-500/10 text-amber-600 border-amber-200" },
  };
  const { label, className } = map[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

// Watcher process status based on heartbeat (3-minute window)
const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000;

function getProcessStatus(lastHeartbeatAt: string | null): "running" | "offline" | "unknown" {
  if (!lastHeartbeatAt) return "unknown";
  const diff = Date.now() - new Date(lastHeartbeatAt).getTime();
  return diff < HEARTBEAT_TIMEOUT_MS ? "running" : "offline";
}

function watcherStatusDot(lastHeartbeatAt: string | null) {
  const status = getProcessStatus(lastHeartbeatAt);
  if (status === "running")
    return (
      <span title="Em execução" className="relative inline-flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
      </span>
    );
  if (status === "offline")
    return <span title="Inativo" className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />;
  return <span title="Sem heartbeat" className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 inline-block" />;
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function truncate(s: string | null, max = 40) {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function CopyPathButton({ path, stopProp }: { path: string; stopProp?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    if (stopProp) e.stopPropagation();
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
      title="Copiar caminho"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function FolderRow({ label, path }: { label: string; path: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <FolderOpen className="h-3 w-3 shrink-0" />
      <span className="font-medium shrink-0">{label}:</span>
      <span className="truncate max-w-[200px] font-mono" title={path}>
        {path.split("\\").slice(-2).join("\\")}
      </span>
      <CopyPathButton path={path} />
    </div>
  );
}

// ── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCard({
  title, value, sub, icon: Icon, color,
}: { title: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Watcher Card ─────────────────────────────────────────────────────────────

function WatcherCard({ watcher }: { watcher: OpsWatcher }) {
  const total      = parseInt(watcher.totalToday)   || 0;
  const success    = parseInt(watcher.successToday) || 0;
  const error      = parseInt(watcher.errorToday)   || 0;
  const procStatus = getProcessStatus(watcher.lastHeartbeatAt);

  const procLabel: Record<typeof procStatus, { text: string; cls: string }> = {
    running: { text: "Em execução", cls: "text-green-600" },
    offline: { text: "Inativo",     cls: "text-red-500"   },
    unknown: { text: "Sem heartbeat", cls: "text-muted-foreground" },
  };

  return (
    <Card className="flex flex-col gap-0">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {watcherStatusDot(watcher.lastHeartbeatAt)}
          <CardTitle className="text-sm font-semibold leading-tight">{watcher.name}</CardTitle>
          {watcher.client && (
            <Badge variant="secondary" className="ml-auto text-xs">{watcher.client}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-medium ${procLabel[procStatus].cls}`}>
            {procLabel[procStatus].text}
          </span>
          {watcher.lastHeartbeatAt && (
            <span className="text-xs text-muted-foreground">
              · {formatTime(watcher.lastHeartbeatAt)}
            </span>
          )}
        </div>
        {watcher.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{watcher.description}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Activity className="h-3 w-3" /> {total} hoje
          </span>
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3 w-3" /> {success}
          </span>
          <span className="flex items-center gap-1 text-red-500">
            <XCircle className="h-3 w-3" /> {error}
          </span>
        </div>
        {watcher.lastProcessedAt && (
          <div className="text-xs text-muted-foreground">
            Último arquivo: <span className="font-medium text-foreground">{formatTime(watcher.lastProcessedAt)}</span>
          </div>
        )}
        {watcher.lastFilename && (
          <div className="text-xs text-muted-foreground truncate" title={watcher.lastFilename ?? undefined}>
            {truncate(watcher.lastFilename, 45)}
          </div>
        )}
        {watcher.lastStatus === "ERROR" && watcher.lastErrorMessage && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1 truncate" title={watcher.lastErrorMessage}>
            {truncate(watcher.lastErrorMessage, 60)}
          </div>
        )}
        {(watcher.folderInput || watcher.folderOutput) && (
          <div className="border-t border-border/50 pt-2 space-y-1">
            {watcher.folderInput  && <FolderRow label="Entrada" path={watcher.folderInput} />}
            {watcher.folderOutput && <FolderRow label="Saída"   path={watcher.folderOutput} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function OpsCenter() {
  const [filterWatcher, setFilterWatcher] = useState<string>("all");
  const [filterStatus,  setFilterStatus]  = useState<string>("all");
  const [filterDate,    setFilterDate]    = useState<string>("");
  const [page, setPage] = useState(0);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const summaryQuery = useQuery<OpsSummary>({
    queryKey: ["/api/ops/summary"],
    refetchInterval: REFETCH_INTERVAL,
  });

  const watchersQuery = useQuery<OpsWatcher[]>({
    queryKey: ["/api/ops/watchers"],
    refetchInterval: REFETCH_INTERVAL,
  });

  const eventsParams = new URLSearchParams();
  if (filterWatcher && filterWatcher !== "all") eventsParams.set("watcher", filterWatcher);
  if (filterStatus  && filterStatus  !== "all") eventsParams.set("status",  filterStatus);
  if (filterDate)                               eventsParams.set("date",    filterDate);
  eventsParams.set("limit",  String(PAGE_SIZE));
  eventsParams.set("offset", String(page * PAGE_SIZE));

  const eventsQuery = useQuery<OpsEventsResponse>({
    queryKey: [`/api/ops/events?${eventsParams.toString()}`],
    refetchInterval: REFETCH_INTERVAL,
  });

  const summary  = summaryQuery.data;
  const watchers = watchersQuery.data ?? [];
  const events   = eventsQuery.data?.events ?? [];
  const total    = eventsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Map watcher slug → folder info for event row expansion
  const watcherBySlug = Object.fromEntries(
    watchers.map((w) => [w.slug, w])
  );

  const anyLoading = summaryQuery.isLoading || watchersQuery.isLoading;

  function resetFilters() {
    setFilterWatcher("all");
    setFilterStatus("all");
    setFilterDate("");
    setPage(0);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            41 Ops Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitoramento em tempo real dos Watchers de documentos
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          Atualiza a cada 30s
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {anyLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <SummaryCard
              title="Total hoje"
              value={summary?.total ?? 0}
              icon={Activity}
              color="text-primary"
            />
            <SummaryCard
              title="Processados"
              value={summary?.success ?? 0}
              sub="com sucesso"
              icon={CheckCircle2}
              color="text-green-500"
            />
            <SummaryCard
              title="Erros"
              value={summary?.error ?? 0}
              sub="requerem atenção"
              icon={XCircle}
              color="text-red-500"
            />
            <SummaryCard
              title="Taxa de sucesso"
              value={summary?.successRate != null ? `${summary.successRate}%` : "—"}
              sub={summary?.warning ? `${summary.warning} avisos` : undefined}
              icon={AlertTriangle}
              color="text-amber-500"
            />
          </>
        )}
      </div>

      {/* Watchers Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Watchers
        </h2>
        {watchersQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {watchers.map((w) => <WatcherCard key={w.slug} watcher={w} />)}
          </div>
        )}
      </div>

      {/* Events Table */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" /> Eventos recentes
          </h2>

          <Select value={filterWatcher} onValueChange={(v) => { setFilterWatcher(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Watcher" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os watchers</SelectItem>
              {watchers.map((w) => (
                <SelectItem key={w.slug} value={w.slug}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="SUCCESS">Sucesso</SelectItem>
              <SelectItem value="ERROR">Erro</SelectItem>
              <SelectItem value="WARNING">Aviso</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            className="h-8 w-40 text-xs"
            value={filterDate}
            onChange={(e) => { setFilterDate(e.target.value); setPage(0); }}
          />

          {(filterWatcher !== "all" || filterStatus !== "all" || filterDate) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
              Limpar filtros
            </Button>
          )}

          <span className="ml-auto text-xs text-muted-foreground">
            {total} evento{total !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-40">Watcher</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead className="w-48 hidden md:table-cell">Renomeado para</TableHead>
                <TableHead className="w-36">Processado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventsQuery.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                    Nenhum evento encontrado
                  </TableCell>
                </TableRow>
              ) : (
                events.map((ev) => {
                  const watcher = watcherBySlug[ev.watcherSlug];
                  const isExpanded = expandedEventId === ev.id;
                  return (
                    <>
                      <TableRow
                        key={ev.id}
                        className={`cursor-pointer ${ev.status === "ERROR" ? "bg-red-50/50 dark:bg-red-950/10" : ""} ${isExpanded ? "border-b-0" : ""}`}
                        onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                      >
                        <TableCell>{statusBadge(ev.status)}</TableCell>
                        <TableCell className="text-xs font-medium">{ev.watcherName}</TableCell>
                        <TableCell className="text-xs max-w-xs">
                          <span className="truncate block" title={ev.filename}>{ev.filename}</span>
                          {ev.status === "ERROR" && ev.errorMessage && (
                            <span className="text-red-500 block truncate mt-0.5" title={ev.errorMessage}>
                              {truncate(ev.errorMessage, 60)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                          {ev.filenameRenamed ? (
                            <span title={ev.filenameRenamed}>{truncate(ev.filenameRenamed, 40)}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {formatTime(ev.processedAt)}
                          </span>
                        </TableCell>
                      </TableRow>
                      {isExpanded && watcher && (
                        <TableRow key={`${ev.id}-detail`} className="bg-muted/30">
                          <TableCell colSpan={5} className="py-2 px-4">
                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                              {watcher.folderInput && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                                  <span className="font-medium shrink-0">Entrada:</span>
                                  <span className="font-mono truncate max-w-xs" title={watcher.folderInput}>
                                    {watcher.folderInput}
                                  </span>
                                  <CopyPathButton path={watcher.folderInput} stopProp />
                                </div>
                              )}
                              {watcher.folderOutput && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                                  <span className="font-medium shrink-0">Saída:</span>
                                  <span className="font-mono truncate max-w-xs" title={watcher.folderOutput}>
                                    {watcher.folderOutput}
                                  </span>
                                  <CopyPathButton path={watcher.folderOutput} stopProp />
                                </div>
                              )}
                              {!watcher.folderInput && !watcher.folderOutput && (
                                <span className="text-xs text-muted-foreground">Pastas não configuradas — configure em Admin → Config. Ops</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
