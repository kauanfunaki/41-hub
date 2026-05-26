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
  ChevronDown,
  FolderOpen,
  Copy,
  Check,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000;

function getProcessStatus(lastHeartbeatAt: string | null): "running" | "offline" | "unknown" {
  if (!lastHeartbeatAt) return "unknown";
  return Date.now() - new Date(lastHeartbeatAt).getTime() < HEARTBEAT_TIMEOUT_MS
    ? "running"
    : "offline";
}

function watcherStatusDot(lastHeartbeatAt: string | null) {
  const status = getProcessStatus(lastHeartbeatAt);
  if (status === "running")
    return (
      <span title="Em execução" className="relative inline-flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
      </span>
    );
  if (status === "offline")
    return <span title="Inativo" className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block shrink-0" />;
  return <span title="Sem heartbeat" className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 inline-block shrink-0" />;
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function truncate(s: string | null, max = 40) {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ── Copy Folder Button ────────────────────────────────────────────────────────

function CopyFolderButton({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors
        ${copied
          ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400"
          : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
        }`}
      title={path}
    >
      {copied
        ? <><Check className="h-3 w-3" /> Copiado!</>
        : <><FolderOpen className="h-3 w-3" /> {label}</>
      }
    </button>
  );
}

// ── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  title, value, sub, icon: Icon, color,
}: { title: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <div className="flex flex-row items-center justify-between p-4 pb-2">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="px-4 pb-4">
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </Card>
  );
}

// ── Watcher Card ─────────────────────────────────────────────────────────────

function WatcherCard({ watcher }: { watcher: OpsWatcher }) {
  const [expanded, setExpanded] = useState(false);

  const total   = parseInt(watcher.totalToday)   || 0;
  const success = parseInt(watcher.successToday) || 0;
  const error   = parseInt(watcher.errorToday)   || 0;

  const procStatus = getProcessStatus(watcher.lastHeartbeatAt);
  const procLabel: Record<typeof procStatus, { text: string; cls: string }> = {
    running: { text: "Em execução", cls: "text-green-600" },
    offline: { text: "Inativo",     cls: "text-red-500"   },
    unknown: { text: "Sem heartbeat", cls: "text-muted-foreground" },
  };

  return (
    <Card
      className="cursor-pointer select-none transition-colors hover:bg-muted/30"
      onClick={() => setExpanded((v) => !v)}
    >
      {/* ── Collapsed header (always visible) ── */}
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          {watcherStatusDot(watcher.lastHeartbeatAt)}
          <span className="text-sm font-semibold leading-tight flex-1 truncate">{watcher.name}</span>
          {watcher.client && (
            <Badge variant="secondary" className="text-xs shrink-0">{watcher.client}</Badge>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>

        {/* Status label + total today */}
        <div className="flex items-center justify-between mt-0.5">
          <span className={`text-xs font-medium ${procLabel[procStatus].cls}`}>
            {procLabel[procStatus].text}
          </span>
          {total > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" /> {total} hoje
            </span>
          )}
        </div>
      </CardHeader>

      {/* ── Expanded details ── */}
      {expanded && (
        <CardContent className="pt-0 border-t border-border/50 mt-1" onClick={(e) => e.stopPropagation()}>
          <div className="pt-3 space-y-3">
            {/* Today's stats */}
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

            {/* Description */}
            {watcher.description && (
              <p className="text-xs text-muted-foreground">{watcher.description}</p>
            )}

            {/* Last status badge + error message (no filename, no timestamp) */}
            {watcher.lastStatus && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Último status:</span>
                {statusBadge(watcher.lastStatus)}
                {watcher.lastStatus === "ERROR" && watcher.lastErrorMessage && (
                  <p className="w-full text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1 truncate" title={watcher.lastErrorMessage}>
                    {truncate(watcher.lastErrorMessage, 70)}
                  </p>
                )}
              </div>
            )}

            {/* Folder copy buttons */}
            {(watcher.folderInput || watcher.folderOutput) && (
              <div className="flex gap-2 flex-wrap">
                {watcher.folderInput  && <CopyFolderButton label="Entrada" path={watcher.folderInput} />}
                {watcher.folderOutput && <CopyFolderButton label="Saída"   path={watcher.folderOutput} />}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function OpsCenter() {
  const { toast } = useToast();
  const [filterWatcher, setFilterWatcher] = useState<string>("all");
  const [filterStatus,  setFilterStatus]  = useState<string>("all");
  const [filterDate,    setFilterDate]    = useState<string>("");
  const [page, setPage] = useState(0);

  const summaryQuery = useQuery<OpsSummary>({
    queryKey: ["/api/ops/summary"],
    refetchInterval: REFETCH_INTERVAL,
  });

  const watchersQuery = useQuery<OpsWatcher[]>({
    queryKey: ["/api/ops/watchers"],
    refetchInterval: REFETCH_INTERVAL,
  });

  const eventsParams = new URLSearchParams();
  if (filterWatcher !== "all") eventsParams.set("watcher", filterWatcher);
  if (filterStatus  !== "all") eventsParams.set("status",  filterStatus);
  if (filterDate)               eventsParams.set("date",    filterDate);
  eventsParams.set("limit",  String(PAGE_SIZE));
  eventsParams.set("offset", String(page * PAGE_SIZE));

  const eventsQuery = useQuery<OpsEventsResponse>({
    queryKey: [`/api/ops/events?${eventsParams.toString()}`],
    refetchInterval: REFETCH_INTERVAL,
  });

  const summary    = summaryQuery.data;
  const watchers   = watchersQuery.data ?? [];
  const events     = eventsQuery.data?.events ?? [];
  const total      = eventsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Map watcher slug → watcher (for constructing full file path on copy)
  const watcherBySlug = Object.fromEntries(watchers.map((w) => [w.slug, w]));

  const anyLoading = summaryQuery.isLoading || watchersQuery.isLoading;

  function resetFilters() {
    setFilterWatcher("all");
    setFilterStatus("all");
    setFilterDate("");
    setPage(0);
  }

  // Copy the full path to the file when clicking an event row
  function handleEventRowClick(ev: OpsEvent) {
    const watcher = watcherBySlug[ev.watcherSlug];
    const folder  = watcher?.folderInput ?? null;
    const path    = folder ? `${folder}\\${ev.filename}` : ev.filename;
    navigator.clipboard.writeText(path).then(() => {
      toast({
        title: "Caminho copiado",
        description: truncate(path, 80),
        duration: 2500,
      });
    });
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
            <Card key={i}><div className="p-6"><Skeleton className="h-14 w-full" /></div></Card>
          ))
        ) : (
          <>
            <SummaryCard title="Total hoje"     value={summary?.total ?? 0}  icon={Activity}      color="text-primary" />
            <SummaryCard title="Processados"    value={summary?.success ?? 0} sub="com sucesso"   icon={CheckCircle2}  color="text-green-500" />
            <SummaryCard title="Erros"          value={summary?.error ?? 0}  sub="requerem atenção" icon={XCircle}    color="text-red-500" />
            <SummaryCard title="Taxa de sucesso"
              value={summary?.successRate != null ? `${summary.successRate}%` : "—"}
              sub={summary?.warning ? `${summary.warning} avisos` : undefined}
              icon={AlertTriangle} color="text-amber-500"
            />
          </>
        )}
      </div>

      {/* Watchers Grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Watchers
          </h2>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                Ao copiar o caminho dos watchers, pressione{" "}
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">WIN</kbd>
                {" + "}
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">R</kbd>
                {" "}e cole o caminho copiado para navegar até a pasta de destino.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {watchersQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><div className="p-6"><Skeleton className="h-20 w-full" /></div></Card>
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
                events.map((ev) => (
                  <TableRow
                    key={ev.id}
                    className={ev.status === "ERROR" ? "bg-red-50/50 dark:bg-red-950/10" : ""}
                  >
                    <TableCell>{statusBadge(ev.status)}</TableCell>
                    <TableCell className="text-xs font-medium">{ev.watcherName}</TableCell>
                    <TableCell
                      className="text-xs max-w-xs cursor-pointer select-none group"
                      title="Clique para copiar o caminho do arquivo"
                      onClick={() => handleEventRowClick(ev)}
                    >
                      <span className="truncate block group-hover:text-primary transition-colors" title={ev.filename}>
                        {ev.filename}
                      </span>
                      {ev.status === "ERROR" && ev.errorMessage && (
                        <span className="text-red-500 block truncate mt-0.5" title={ev.errorMessage}>
                          {truncate(ev.errorMessage, 60)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                      {ev.filenameRenamed
                        ? <span title={ev.filenameRenamed}>{truncate(ev.filenameRenamed, 40)}</span>
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {formatTime(ev.processedAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
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
