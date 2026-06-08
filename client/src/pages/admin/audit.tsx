import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Calendar,
  Filter,
  Download,
  Loader2,
  Search,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AuditLog } from "@shared/schema";

interface AuditLogWithActor extends AuditLog {
  actorName?: string;
  actorEmail?: string;
}

const actionLabels: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  resource_access: "Acesso a Recurso",
  resource_create: "Criação de Recurso",
  resource_update: "Atualização de Recurso",
  resource_delete: "Exclusão de Recurso",
  resource_health_update: "Saúde de Recurso",
  user_create: "Criação de Usuário",
  user_update: "Atualização de Usuário",
  sector_create: "Criação de Setor",
  sector_update: "Atualização de Setor",
  sector_delete: "Exclusão de Setor",
  favorite_add: "Adição de Favorito",
  favorite_remove: "Remoção de Favorito",
  alert_create: "Criação de Alerta",
  api_token_create: "Criação de Token",
  api_token_revoke: "Revogação de Token",
};

function getActionStyle(action: string): string {
  if (action.includes("_success") || action === "login") {
    return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
  }
  if (action.includes("_failed")) {
    return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
  }
  if (
    action.includes("delete") ||
    action.includes("remove") ||
    action.includes("revoke")
  ) {
    return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
  }
  if (action.includes("create") || action.includes("add")) {
    return "bg-primary/10 text-primary border-primary/20";
  }
  if (
    action.includes("update") ||
    action.includes("changed") ||
    action.includes("health")
  ) {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  }
  return "bg-muted text-muted-foreground border-border";
}

function ActionBadge({ action }: { action: string }) {
  const label = actionLabels[action] || action;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border whitespace-nowrap",
        getActionStyle(action),
      )}
    >
      {label}
    </span>
  );
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase() || "?";
  return (
    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0 select-none">
      {initials}
    </div>
  );
}

async function downloadExport(url: string, filename: string, toast: any) {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      let msg = "Falha ao exportar";
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast({ title: "Exportado com sucesso" });
  } catch (err: any) {
    toast({
      title: "Erro ao exportar",
      description: err?.message,
      variant: "destructive",
    });
  }
}

export default function AdminAudit() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [exportLoading, setExportLoading] = useState<"csv" | "json" | null>(
    null,
  );

  const queryUrl = `/api/admin/audit?limit=100&page=${page}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}${actionFilter !== "all" ? `&action=${actionFilter}` : ""}`;

  const { data: logs = [], isLoading } = useQuery<AuditLogWithActor[]>({
    queryKey: [queryUrl],
    queryFn: () =>
      fetch(queryUrl, { credentials: "include" }).then((r) => r.json()),
  });

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.actorName?.toLowerCase().includes(q) ||
      log.actorEmail?.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q)
    );
  });

  const uniqueActions = Array.from(new Set(logs.map((log) => log.action)));

  const formatDate = (date: Date | string) => {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(date));
  };

  const handleExport = async (format: "csv" | "json") => {
    setExportLoading(format);
    const url = `/api/admin/reports/audit-logs?format=${format}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
    await downloadExport(url, `audit_logs.${format}`, toast);
    setExportLoading(null);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-4/10">
          <FileText className="h-5 w-5 text-chart-4" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Logs de atividades do sistema
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="border-b p-4 space-y-3">
          {/* Row 1: date + export */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> De
                </Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-36 [color-scheme:light] dark:[color-scheme:dark]"
                  data-testid="input-audit-from"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Até</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-36 [color-scheme:light] dark:[color-scheme:dark]"
                  data-testid="input-audit-to"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("csv")}
                disabled={exportLoading === "csv"}
                data-testid="button-export-audit-csv"
              >
                {exportLoading === "csv" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("json")}
                disabled={exportLoading === "json"}
                data-testid="button-export-audit-json"
              >
                {exportLoading === "json" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                JSON
              </Button>
            </div>
          </div>

          {/* Row 2: count + search + filter */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground tabular-nums shrink-0">
              {filteredLogs.length}{" "}
              {filteredLogs.length !== 1 ? "registros" : "registro"}
            </span>

            <div className="flex gap-2 ml-auto flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar logs..."
                  className="pl-8 h-9 w-52 text-sm"
                />
              </div>

              <Select
                value={actionFilter}
                onValueChange={(v) => {
                  setActionFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="w-[180px] h-9"
                  data-testid="select-action-filter"
                >
                  <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Filtrar ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  {uniqueActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {actionLabels[action] || action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {searchQuery || actionFilter !== "all" || from || to
              ? "Nenhum log encontrado para os filtros selecionados"
              : "Nenhum log registrado"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Data/Hora
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Usuário
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Ação
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Alvo
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    IP
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="hover:bg-muted/40 transition-colors"
                    data-testid={`row-log-${log.id}`}
                  >
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {formatDate(log.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={log.actorName || "Sistema"} />
                        <div>
                          <p className="text-sm font-medium leading-tight">
                            {log.actorName || "Sistema"}
                          </p>
                          {log.actorEmail && (
                            <p className="text-xs text-muted-foreground">
                              {log.actorEmail}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={log.action} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.targetType && log.targetId ? (
                        <TooltipProvider delayDuration={120}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm font-mono cursor-default">
                                {log.targetType}:{" "}
                                <span className="text-xs">{log.targetId.slice(0, 8)}…</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="font-mono text-xs max-w-xs break-all">
                              {log.targetType}: {log.targetId}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {log.ip || "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          Página {page}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={logs.length < 100}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
