import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MessageSquarePlus, Bug, Lightbulb, Wrench, HelpCircle,
  Inbox, Check, Ticket, Filter, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type FeedbackType = "BUG" | "SUGESTAO" | "MELHORIA" | "OUTRO";

const TYPE_OPTIONS = [
  {
    value: "BUG" as FeedbackType,
    label: "Bug",
    icon: Bug,
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    stripe: "bg-red-500",
  },
  {
    value: "SUGESTAO" as FeedbackType,
    label: "Sugestão",
    icon: Lightbulb,
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    stripe: "bg-amber-500",
  },
  {
    value: "MELHORIA" as FeedbackType,
    label: "Melhoria",
    icon: Wrench,
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    stripe: "bg-blue-500",
  },
  {
    value: "OUTRO" as FeedbackType,
    label: "Outro",
    icon: HelpCircle,
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    stripe: "bg-slate-400",
  },
];

function typeInfo(type: string) {
  return TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[3];
}

function formatDate(d: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(d));
}

interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  userName?: string | null;
}

export default function AdminFeedbackPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [typeFilter, setTypeFilter] = useState<FeedbackType | "all">("all");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/admin/feedback"],
    queryFn: () => fetch("/api/admin/feedback", { credentials: "include" }).then((r) => r.json()),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/feedback/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
    },
    onError: () => {
      toast({ title: "Erro ao marcar como lido", variant: "destructive" });
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (id: string) => {
      setCreatingTicketId(id);
      const res = await apiRequest("POST", `/api/admin/feedback/${id}/create-ticket`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Erro ao criar chamado");
      }
      return res.json();
    },
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      toast({ title: "Chamado criado com sucesso" });
      setLocation(`/tickets/${ticket.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao criar chamado", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      setCreatingTicketId(null);
    },
  });

  const filtered = items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (readFilter === "unread" && item.isRead) return false;
    if (readFilter === "read" && !item.isRead) return false;
    return true;
  });

  const unreadCount = items.filter((i) => !i.isRead).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <MessageSquarePlus className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Feedbacks Recebidos</h1>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">{unreadCount} não lido{unreadCount !== 1 ? "s" : ""}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Bugs, sugestões e melhorias enviados pelos usuários
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={(v) => setReadFilter(v as any)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status leitura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="unread">Não lidos</SelectItem>
            <SelectItem value="read">Lidos</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} feedback{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhum feedback encontrado</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden divide-y">
          {filtered.map((item) => {
            const info = typeInfo(item.type);
            const Icon = info.icon;
            const isCreatingThisTicket = createTicketMutation.isPending && creatingTicketId === item.id;
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-stretch transition-colors hover:bg-muted/20",
                  !item.isRead && "bg-primary/[0.02]"
                )}
              >
                {/* Type stripe */}
                <div className={cn("w-1 shrink-0", info.stripe)} />

                {/* Content */}
                <div className="flex flex-1 gap-4 px-5 py-4 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", info.badgeClass)}>
                        {info.label}
                      </span>
                      {!item.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {item.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.userName ?? "Usuário desconhecido"} · {formatDate(item.createdAt)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-start mt-0.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs gap-1.5"
                      disabled={isCreatingThisTicket}
                      onClick={() => createTicketMutation.mutate(item.id)}
                    >
                      {isCreatingThisTicket ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Ticket className="h-3 w-3" />
                      )}
                      Abrir chamado
                    </Button>
                    {!item.isRead && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground"
                        disabled={markReadMutation.isPending}
                        onClick={() => markReadMutation.mutate(item.id)}
                      >
                        <Check className="h-3 w-3" />
                        Marcar lido
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
