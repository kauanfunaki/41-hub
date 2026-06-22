import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Ticket,
  Plus,
  Search,
  Clock,
} from "lucide-react";
import type { TicketWithDetails, TicketSlaCycle } from "@shared/schema";
import { cn } from "@/lib/utils";

// ── Labels / colours ────────────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  NA_FILA: "Aberto",
  EM_ANDAMENTO: "Em Andamento",
  AGUARDANDO_USUARIO: "Aguardando Usuário",
  AGUARDANDO_APROVACAO: "Aguardando Aprovação",
  AGUARDANDO_REQUERENTE: "Aguardando Usuário",
  STANDBY: "Em Pausa",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

const priorityLabels: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

const priorityColors: Record<string, string> = {
  BAIXA: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20",
  MEDIA: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
  ALTA: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20",
  URGENTE: "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20",
};

const statusColors: Record<string, string> = {
  ABERTO: "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20",
  NA_FILA: "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20",
  EM_ANDAMENTO: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20",
  AGUARDANDO_USUARIO: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
  AGUARDANDO_REQUERENTE: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
  STANDBY: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20",
  RESOLVIDO: "bg-muted text-muted-foreground border border-border",
  AGUARDANDO_APROVACAO: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-500/20",
  CANCELADO: "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20",
};

// ── SLA helper ───────────────────────────────────────────────────────────────

function getSlaStatus(
  cycle: TicketSlaCycle | null | undefined
): { label: string; color: string } {
  if (!cycle) return { label: "—", color: "" };
  if (cycle.resolvedAt) {
    return cycle.resolutionBreached
      ? {
          label: "Estourado",
          color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        }
      : {
          label: "Concluído",
          color:
            "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        };
  }
  const hoursLeft =
    (new Date(cycle.resolutionDueAt).getTime() - Date.now()) / 3_600_000;
  if (hoursLeft < 0)
    return {
      label: "Estourado",
      color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
  if (hoursLeft < 4)
    return {
      label: "Em risco",
      color:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    };
  return {
    label: "Em dia",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };
}

function toSentenceCase(str: string): string {
  if (!str) return str;
  if (str === str.toUpperCase() && str.length > 3) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  return str;
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(dateStr));
}

// ── Ticket card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: TicketWithDetails }) {
  const { user } = useAuth();
  const isAdminOrCoord = user?.isAdmin || user?.roles?.some(r => r.roleName === "Coordenador");
  const sla = getSlaStatus(ticket.currentCycle);
  return (
    <Link href={`/tickets/${ticket.id}`}>
      <div
        className="flex items-stretch rounded-xl border bg-card hover:bg-accent transition-colors cursor-pointer overflow-hidden group"
        data-testid={`ticket-${ticket.id}`}
      >
        {/* Sector stripe */}
        <div className="w-1 shrink-0" style={{ backgroundColor: ticket.requesterSectorColor || "#94a3b8" }} />

        {/* Content */}
        <div className="flex flex-1 items-center gap-4 p-4 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">
              {toSentenceCase(ticket.title)}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5 flex-wrap">
              <span className="font-medium text-foreground/60">
                {ticket.categoryBranch}/{ticket.categoryName}
              </span>
              <span>·</span>
              <span>{ticket.requesterSectorName}</span>
              <span>·</span>
              <span>{ticket.creatorName}</span>
              <span>·</span>
              <span>{formatDate(ticket.createdAt as unknown as string)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {sla.color && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${sla.color}`}
                data-testid={`sla-badge-${ticket.id}`}
              >
                <Clock className="h-3 w-3" />
                {sla.label}
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityColors[ticket.priority]}`}>
              {priorityLabels[ticket.priority]}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[ticket.status]}`}>
              {statusLabels[ticket.status]}
              {isAdminOrCoord && ticket.status === "NA_FILA" && ticket.queuePosition != null && (
                <span className="ml-1 opacity-70">#{ticket.queuePosition}</span>
              )}
            </span>
            {ticket.assignees && ticket.assignees.length > 0 && (
              <div className="flex items-center gap-1">
                {ticket.assignees.map((a) => (
                  <div
                    key={a.userId}
                    className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0"
                    title={a.userName}
                  >
                    {a.userName.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

type Priority = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE" | "all";

export default function TicketsIndex() {
  const { user } = useAuth();
  const [tab, setTab] = useState("ativos");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority>("all");

  const isAdminOrCoord =
    user?.isAdmin || user?.roles?.some((r) => r.roleName === "Coordenador");

  // ── Active list: all non-closed tickets (server default). Always fetched so
  //    the tab count badges show even before clicking each tab.
  const { data: activeTickets = [], isLoading: loadingActive } = useQuery<
    TicketWithDetails[]
  >({
    queryKey: ["/api/tickets", { tab: "active", q: search || undefined }],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set("q", search);
      const res = await fetch(`/api/tickets?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });

  // ── Histórico: RESOLVIDO + CANCELADO. Always fetched for the count badge.
  const { data: allTickets = [], isLoading: loadingAll } = useQuery<
    TicketWithDetails[]
  >({
    queryKey: ["/api/tickets", { tab: "historico", q: search || undefined }],
    queryFn: async () => {
      const p = new URLSearchParams({ includeClosed: "true" });
      if (search) p.set("q", search);
      const res = await fetch(`/api/tickets?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });

  // ── Status buckets ──────────────────────────────────────────────────────
  const ATIVOS_STATUSES = ["ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_APROVACAO"];
  const AGUARDANDO_STATUSES = ["AGUARDANDO_REQUERENTE", "AGUARDANDO_USUARIO"];

  const inBucket = (t: TicketWithDetails, statuses: string[]) =>
    statuses.includes(t.status);

  // Tab counts (independent of the priority filter → always show the total)
  const countAtivos = activeTickets.filter((t) => inBucket(t, ATIVOS_STATUSES)).length;
  const countAguardando = activeTickets.filter((t) => inBucket(t, AGUARDANDO_STATUSES)).length;
  const countStandby = activeTickets.filter((t) => t.status === "STANDBY").length;
  const countHistorico = allTickets.filter(
    (t) => t.status === "RESOLVIDO" || t.status === "CANCELADO"
  ).length;

  // Apply priority filter for the displayed list only
  const matchesPriority = (t: TicketWithDetails) =>
    priorityFilter === "all" || t.priority === priorityFilter;

  const displayTickets = (
    tab === "ativos"
      ? activeTickets.filter((t) => inBucket(t, ATIVOS_STATUSES))
      : tab === "aguardando"
      ? activeTickets.filter((t) => inBucket(t, AGUARDANDO_STATUSES))
      : tab === "standby"
      ? activeTickets.filter((t) => t.status === "STANDBY")
      : allTickets.filter((t) => t.status === "RESOLVIDO" || t.status === "CANCELADO")
  ).filter(matchesPriority);

  const isLoading = tab === "historico" ? loadingAll : loadingActive;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Ticket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Chamados</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhe e gerencie chamados de suporte
            </p>
          </div>
        </div>
        {isAdminOrCoord && (
          <Link href="/tickets/new">
            <Button data-testid="button-new-ticket">
              <Plus className="mr-2 h-4 w-4" />
              Novo Chamado
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar chamados..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-tickets"
          />
        </div>

        <Select
          value={priorityFilter}
          onValueChange={(v) => setPriorityFilter(v as Priority)}
        >
          <SelectTrigger className="w-48 min-w-[12rem]" data-testid="select-priority-filter">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as prioridades</SelectItem>
            <SelectItem value="URGENTE">Urgente</SelectItem>
            <SelectItem value="ALTA">Alta</SelectItem>
            <SelectItem value="MEDIA">Média</SelectItem>
            <SelectItem value="BAIXA">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-4">
          <TabsList data-tutorial="tickets-tabs">
            <TabsTrigger value="ativos" data-testid="tab-active">
              Em Fila
              {countAtivos > 0 && (
                <Badge variant="secondary" className="ml-1.5 px-1.5 h-4 text-[10px]">
                  {countAtivos}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="aguardando" data-testid="tab-waiting">
              Aguardando Usuário
              {countAguardando > 0 && (
                <Badge variant="secondary" className="ml-1.5 px-1.5 h-4 text-[10px]">
                  {countAguardando}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="standby" data-testid="tab-standby">
              Em Pausa
              {countStandby > 0 && (
                <Badge variant="secondary" className="ml-1.5 px-1.5 h-4 text-[10px]">
                  {countStandby}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Histórico — separado à direita */}
          <button
            onClick={() => setTab("historico")}
            data-testid="tab-history"
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors border",
              tab === "historico"
                ? "bg-background text-foreground shadow-sm border-border"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Histórico
            {countHistorico > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 h-4 text-[10px]">
                {countHistorico}
              </Badge>
            )}
          </button>
        </div>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Carregando...
            </div>
          ) : displayTickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {tab === "aguardando"
                ? "Nenhum chamado aguardando o usuário"
                : tab === "standby"
                ? "Nenhum chamado em pausa"
                : "Nenhum chamado encontrado"}
            </div>
          ) : (
            <div className="space-y-2" data-tutorial="tickets-list">
              {displayTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}