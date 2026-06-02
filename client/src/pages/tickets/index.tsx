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

// ── Labels / colours ────────────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ANDAMENTO: "Em Andamento",
  AGUARDANDO_USUARIO: "Aguardando Usuário",
  AGUARDANDO_APROVACAO: "Aguardando Aprovação",
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

const priorityStripe: Record<string, string> = {
  BAIXA: "bg-blue-400",
  MEDIA: "bg-amber-500",
  ALTA: "bg-orange-500",
  URGENTE: "bg-red-500",
};

const statusColors: Record<string, string> = {
  ABERTO: "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20",
  EM_ANDAMENTO: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20",
  AGUARDANDO_USUARIO: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Ticket card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: TicketWithDetails }) {
  const sla = getSlaStatus(ticket.currentCycle);
  return (
    <Link href={`/tickets/${ticket.id}`}>
      <div
        className="flex items-stretch rounded-xl border bg-card hover:bg-accent transition-colors cursor-pointer overflow-hidden group"
        data-testid={`ticket-${ticket.id}`}
      >
        {/* Priority stripe */}
        <div className={`w-1 shrink-0 ${priorityStripe[ticket.priority] ?? "bg-muted"}`} />

        {/* Content */}
        <div className="flex flex-1 items-center gap-4 p-4 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">
              {ticket.title}
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

  // ── Ativos: ABERTO + EM_ANDAMENTO (no status filter = server default active)
  const { data: activeTickets = [], isLoading: loadingActive } = useQuery<
    TicketWithDetails[]
  >({
    queryKey: ["/api/tickets", { tab: "ativos", q: search || undefined }],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set("q", search);
      const res = await fetch(`/api/tickets?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
    enabled: tab === "ativos",
  });

  // ── Aguardando você: status=AGUARDANDO_USUARIO (only for admin/coord)
  const { data: waitingTickets = [], isLoading: loadingWaiting } = useQuery<
    TicketWithDetails[]
  >({
    queryKey: ["/api/tickets", { tab: "aguardando", q: search || undefined }],
    queryFn: async () => {
      const p = new URLSearchParams({ status: "AGUARDANDO_USUARIO" });
      if (search) p.set("q", search);
      const res = await fetch(`/api/tickets?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
    enabled: tab === "aguardando" && !!isAdminOrCoord,
  });

  // ── Histórico: RESOLVIDO + CANCELADO
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
    enabled: tab === "historico",
  });

  // Pick the right data for current tab
  const rawTickets =
    tab === "ativos"
      ? activeTickets
      : tab === "aguardando"
      ? waitingTickets
      : allTickets;

  const isLoading =
    tab === "ativos"
      ? loadingActive
      : tab === "aguardando"
      ? loadingWaiting
      : loadingAll;

  // Client-side priority filter
  const ticketsToShow =
    priorityFilter === "all"
      ? rawTickets
      : rawTickets.filter((t) => t.priority === priorityFilter);

  // Histórico: only closed statuses
  const historyTickets = ticketsToShow.filter(
    (t) => t.status === "RESOLVIDO" || t.status === "CANCELADO"
  );

  const displayTickets =
    tab === "historico" ? historyTickets : ticketsToShow;

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
        <TabsList>
          <TabsTrigger value="ativos" data-testid="tab-active">
            Ativos
            {activeTickets.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 h-4 text-[10px]">
                {activeTickets.length}
              </Badge>
            )}
          </TabsTrigger>

          {isAdminOrCoord && (
            <TabsTrigger value="aguardando" data-testid="tab-waiting">
              Aguardando você
              {waitingTickets.length > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1.5 px-1.5 h-4 text-[10px]"
                >
                  {waitingTickets.length}
                </Badge>
              )}
            </TabsTrigger>
          )}

          <TabsTrigger value="historico" data-testid="tab-history">
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Carregando...
            </div>
          ) : displayTickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {tab === "aguardando"
                ? "Nenhum chamado aguardando sua ação"
                : "Nenhum chamado encontrado"}
            </div>
          ) : (
            <div className="space-y-2">
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