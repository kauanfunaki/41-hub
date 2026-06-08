import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  MessageSquare,
  Paperclip,
  Upload,
  Download,
  Loader2,
  Send,
  Pencil,
  AlertTriangle,
  CheckSquare,
  HelpCircle,
  ShieldCheck,
  XCircle,
  Check,
  Info,
  FileText,
  Image,
  Film,
  File,
  Lock,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type {
  TicketWithDetails,
  TicketComment,
  TicketAttachment,
  TicketSlaCycle,
  TicketEvent,
} from "@shared/schema";

// ── Config maps ──────────────────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  NA_FILA: "Na fila",
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

const priorityStrip: Record<string, string> = {
  BAIXA:   "bg-blue-500",
  MEDIA:   "bg-amber-400",
  ALTA:    "bg-orange-500",
  URGENTE: "bg-red-600",
};

const priorityText: Record<string, string> = {
  BAIXA:   "text-blue-600 dark:text-blue-400",
  MEDIA:   "text-amber-600 dark:text-amber-400",
  ALTA:    "text-orange-600 dark:text-orange-400",
  URGENTE: "text-red-600 dark:text-red-400",
};

const priorityBadge: Record<string, string> = {
  BAIXA:   "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  MEDIA:   "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  ALTA:    "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
  URGENTE: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
};

const statusBadge: Record<string, string> = {
  ABERTO:               "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  NA_FILA:              "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200",
  EM_ANDAMENTO:         "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  AGUARDANDO_USUARIO:   "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  RESOLVIDO:            "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  AGUARDANDO_APROVACAO: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
  CANCELADO:            "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(dateStr));
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function getFileIcon(mimeType: string | null | undefined) {
  if (!mimeType) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  if (mimeType.startsWith("video/")) return <Film className="h-4 w-4 text-purple-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function getSlaInfo(cycle: TicketSlaCycle | null | undefined) {
  if (!cycle) return null;
  const now = new Date();
  const resDue = new Date(cycle.resolutionDueAt);
  const firstDue = new Date(cycle.firstResponseDueAt);

  let resStatus = "Em dia";
  let resColor = "text-emerald-600";
  let resBgColor = "bg-emerald-500";
  if (cycle.resolvedAt) {
    resStatus = cycle.resolutionBreached ? "Estourado" : "Concluído";
    resColor = cycle.resolutionBreached ? "text-red-600" : "text-emerald-600";
    resBgColor = cycle.resolutionBreached ? "bg-red-500" : "bg-emerald-500";
  } else if (now > resDue) {
    resStatus = "Estourado"; resColor = "text-red-600"; resBgColor = "bg-red-500";
  } else if ((resDue.getTime() - now.getTime()) / 3_600_000 < 4) {
    resStatus = "Em risco"; resColor = "text-amber-600"; resBgColor = "bg-amber-500";
  }

  let firstStatus = "Pendente";
  let firstColor = "text-amber-600";
  if (cycle.firstResponseAt) {
    firstStatus = cycle.firstResponseBreached ? "Estourado" : "Respondido";
    firstColor = cycle.firstResponseBreached ? "text-red-600" : "text-emerald-600";
  } else if (now > firstDue) {
    firstStatus = "Estourado"; firstColor = "text-red-600";
  }

  // SLA progress (0–100)
  const created = new Date((cycle as any).createdAt || cycle.resolutionDueAt);
  const totalMs = resDue.getTime() - created.getTime();
  const usedMs = now.getTime() - created.getTime();
  const progress = Math.min(100, Math.max(0, totalMs > 0 ? (usedMs / totalMs) * 100 : 0));

  return { resStatus, resColor, resBgColor, firstStatus, firstColor, cycle, progress };
}

type CommentWithAuthor = TicketComment & { authorName?: string; authorEmail?: string };
type TicketEventWithActor = TicketEvent & { actorName?: string };
type AttachmentWithUploader = TicketAttachment & { uploadedByName?: string | null };

interface ChecklistItem {
  id: string; ticketId: string; key: string; label: string;
  isDone: boolean; doneBy: string | null; doneAt: string | null;
}
interface DirectoryUser {
  id: string; name: string; email: string;
  roles?: Array<{ sectorId: string; sectorName: string; roleName: string }>;
  isAdmin?: boolean;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
      {children}
    </p>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right font-medium">{children}</span>
    </div>
  );
}

function SlaEventRow({ event }: { event: TicketEventWithActor }) {
  const data = event.data as any;
  return (
    <div className="flex gap-3 items-start">
      <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 mt-0.5">
        <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-semibold text-blue-800 dark:text-blue-200">
            SLA alterado {event.actorName && <span className="font-normal text-blue-600 dark:text-blue-400">por {event.actorName}</span>}
          </span>
          <span className="text-muted-foreground">{formatDate(event.createdAt)}</span>
        </div>
        <p className="text-blue-900 dark:text-blue-100">
          Prazo: {data?.from ? <s className="text-muted-foreground">{formatDate(data.from)}</s> : "—"}{" → "}
          <span className="font-semibold">{formatDate(data?.to)}</span>
        </p>
        {data?.note && <p className="text-muted-foreground mt-0.5"><span className="font-medium">Motivo:</span> {data.note}</p>}
      </div>
    </div>
  );
}

function AssigneesBlock({ assignees, isAdmin, assignableUsers, onSave, isSaving }: {
  assignees: Array<{ userId: string; userName: string; userEmail: string }>;
  isAdmin: boolean; assignableUsers: DirectoryUser[];
  onSave: (ids: string[]) => void; isSaving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(assignees.map(a => a.userId));

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">Responsáveis</span>
        {isAdmin && (
          <Popover open={open} onOpenChange={(v) => { if (v) setSelected(assignees.map(a => a.userId)); setOpen(v); }}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" data-testid="button-edit-assignees">
                <Pencil className="h-2.5 w-2.5 mr-1" />
                Editar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              <Command>
                <CommandInput placeholder="Buscar usuário..." />
                <CommandList>
                  <CommandEmpty>Nenhum usuário encontrado</CommandEmpty>
                  <CommandGroup heading="Admins disponíveis">
                    {assignableUsers.map((u) => (
                      <CommandItem key={u.id} value={u.name} onSelect={() => toggle(u.id)} data-testid={`assignee-option-${u.id}`}>
                        <Check className={cn("mr-2 h-4 w-4", selected.includes(u.id) ? "opacity-100" : "opacity-0")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              <div className="border-t p-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={() => { onSave(selected); setOpen(false); }} disabled={isSaving} data-testid="button-save-assignees">
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {assignees.length === 0 ? (
        <span className="text-xs text-muted-foreground italic">Nenhum</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {assignees.map((a) => (
            <TooltipProvider key={a.userId}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 border border-primary/20">
                    <span className="text-[10px] font-semibold text-primary">{getInitials(a.userName)}</span>
                    <span className="text-[10px] font-medium">{a.userName.split(" ")[0]}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{a.userName}</p>
                  <p className="text-xs text-muted-foreground">{a.userEmail}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TicketsDetail() {
  const [, params] = useRoute("/tickets/:id");
  const ticketId = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.isAdmin;
  const isCoordinator = user?.roles?.some(r => r.roleName === "Coordenador");

  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false);
  const [newDeadline, setNewDeadline] = useState("");
  const [deadlineReason, setDeadlineReason] = useState("");
  const [requestInfoOpen, setRequestInfoOpen] = useState(false);
  const [requestInfoMessage, setRequestInfoMessage] = useState("");
  const [requestInfoMarkAwaiting, setRequestInfoMarkAwaiting] = useState(true);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
  const [approvalNote, setApprovalNote] = useState("");
  const [queueOrderInput, setQueueOrderInput] = useState<string>("");

  const { data: ticket, isLoading } = useQuery<TicketWithDetails>({
    queryKey: ["/api/tickets", ticketId],
    queryFn: async () => { const r = await fetch(`/api/tickets/${ticketId}`, { credentials: "include" }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    enabled: !!ticketId,
  });
  const { data: comments = [] } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/tickets", ticketId, "comments"],
    queryFn: async () => { const r = await fetch(`/api/tickets/${ticketId}/comments`, { credentials: "include" }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    enabled: !!ticketId,
  });
  const { data: slaEvents = [] } = useQuery<TicketEventWithActor[]>({
    queryKey: ["/api/tickets", ticketId, "events"],
    queryFn: async () => { const r = await fetch(`/api/tickets/${ticketId}/events`, { credentials: "include" }); if (!r.ok) return []; return r.json(); },
    enabled: !!ticketId,
  });
  const { data: attachments = [] } = useQuery<AttachmentWithUploader[]>({
    queryKey: ["/api/tickets", ticketId, "attachments"],
    queryFn: async () => { const r = await fetch(`/api/tickets/${ticketId}/attachments`, { credentials: "include" }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    enabled: !!ticketId,
  });
  const { data: allUsers = [] } = useQuery<DirectoryUser[]>({
    queryKey: ["/api/users/directory", "all"],
    queryFn: async () => { const r = await fetch("/api/users/directory?all=true", { credentials: "include" }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    enabled: !!isAdmin,
  });
  const { data: checklist = [] } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/tickets", ticketId, "checklist"],
    queryFn: async () => { const r = await fetch(`/api/tickets/${ticketId}/checklist`, { credentials: "include" }); if (!r.ok) return []; return r.json(); },
    enabled: !!ticketId,
  });
  const { data: approvalData } = useQuery<{ approval: any; isApprover: boolean; approverIds: string[] }>({
    queryKey: ["/api/tickets", ticketId, "approval"],
    queryFn: async () => { const r = await fetch(`/api/tickets/${ticketId}/approval`, { credentials: "include" }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    enabled: !!ticketId,
  });

  const assignableUsers = (() => {
    if (!ticket || !allUsers.length) return [];
    return allUsers.filter(u => u.isAdmin || u.roles?.some(r => r.roleName === "Admin"));
  })();

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => { const r = await apiRequest("PATCH", `/api/tickets/${ticketId}`, patch); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tickets"] }); queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "events"] }); toast({ title: "Chamado atualizado" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const assignMutation = useMutation({
    mutationFn: async (assigneeIds: string[]) => { await apiRequest("PUT", `/api/tickets/${ticketId}/assignees`, { assigneeIds }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId] }); toast({ title: "Responsáveis atualizados" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const commentMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", `/api/tickets/${ticketId}/comments`, { body: commentBody, isInternal }); return r.json(); },
    onSuccess: () => { setCommentBody(""); setIsInternal(false); queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "comments"] }); toast({ title: "Comentário adicionado" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(`/api/tickets/${ticketId}/attachments`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Upload failed"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "attachments"] }); toast({ title: "Anexo enviado" }); },
    onError: (e: any) => toast({ title: "Falha no envio do anexo", description: e.message || "Ocorreu um erro ao enviar o arquivo.", variant: "destructive" }),
  });
  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const r = await apiRequest("DELETE", `/api/tickets/${ticketId}/attachments/${attachmentId}`);
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Delete failed"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "attachments"] }); toast({ title: "Anexo removido" }); },
    onError: (e: any) => toast({ title: "Erro ao remover anexo", description: e.message, variant: "destructive" }),
  });

  const checklistMutation = useMutation({
    mutationFn: async ({ itemId, isDone }: { itemId: string; isDone: boolean }) => { await apiRequest("PATCH", `/api/tickets/${ticketId}/checklist/${itemId}`, { isDone }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "checklist"] }),
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const requestInfoMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", `/api/tickets/${ticketId}/request-info`, { message: requestInfoMessage, markAwaiting: requestInfoMarkAwaiting }); return r.json(); },
    onSuccess: () => { setRequestInfoOpen(false); setRequestInfoMessage(""); setRequestInfoMarkAwaiting(true); queryClient.invalidateQueries({ queryKey: ["/api/tickets"] }); queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "comments"] }); toast({ title: "Solicitação enviada" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const approvalMutation = useMutation({
    mutationFn: async ({ action, note }: { action: "approve" | "reject"; note: string }) => { const r = await apiRequest("POST", `/api/tickets/${ticketId}/${action === "approve" ? "approve" : "reject"}`, { note }); return r.json(); },
    onSuccess: (data: any) => { queryClient.invalidateQueries({ queryKey: ["/api/tickets"] }); queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "approval"] }); setApprovalDialogOpen(false); setApprovalNote(""); toast({ title: data.message || "Decisão registrada" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const canComment = isAdmin || isCoordinator;
  const isCreator = !!ticket && ticket.createdBy === user?.id;
  const canUpload = canComment || isCreator;

  const imageAttachments = attachments.filter(a => a.mimeType?.startsWith("image/"));

  const timeline = [
    ...comments.map(c => ({ ...c, _kind: "comment" as const, _date: new Date(c.createdAt) })),
    ...slaEvents.map(e => ({ ...e, _kind: "sla_event" as const, _date: new Date(e.createdAt) })),
    ...imageAttachments.map(a => ({ ...a, _kind: "image_attachment" as const, _date: new Date(a.createdAt) })),
  ].sort((a, b) => a._date.getTime() - b._date.getTime());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!ticket) {
    return <div className="p-6 text-center text-muted-foreground">Chamado não encontrado</div>;
  }

  const slaInfo = getSlaInfo(ticket.currentCycle);
  const isManualDeadline = (ticket.currentCycle as any)?.resolutionDueAtManual;
  const manualReason = (ticket.currentCycle as any)?.resolutionDueAtManualReason;

  const doneCount = checklist.filter(c => c.isDone).length;
  const checklistProgress = checklist.length > 0 ? (doneCount / checklist.length) * 100 : 0;

  return (
    <div className="min-h-full bg-muted/20">
      {/* ── Header ── */}
      <div className="bg-card border-b sticky top-0 z-10">
        {/* Priority strip */}
        <div className={`h-0.5 ${priorityStrip[ticket.priority]}`} />
        <div className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Link href="/tickets">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>

            <div className="flex-1 min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${priorityText[ticket.priority]}`}>
                  {priorityLabels[ticket.priority]}
                </span>
                <span className="text-muted-foreground text-[10px]">·</span>
                <span className="text-[10px] text-muted-foreground">{ticket.categoryBranch} / {ticket.categoryName}</span>
                <span className="text-muted-foreground text-[10px]">·</span>
                <span className="text-[10px] text-muted-foreground">{ticket.requesterSectorName}</span>
              </div>
              <h1 className="text-base font-semibold text-foreground leading-tight truncate" data-testid="ticket-title">
                {ticket.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(() => {
                const isPrivileged = isAdmin || isCoordinator;
                const displayStatus = (!isPrivileged && ticket.status === "NA_FILA") ? "ABERTO" : ticket.status;
                return (
                  <Badge variant="secondary" className={`text-[11px] ${statusBadge[displayStatus]}`}>
                    {statusLabels[displayStatus]}
                  </Badge>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-0">

        {/* ── LEFT COLUMN ── */}
        <div className="border-r min-h-full">

          {/* Description */}
          <section className="px-6 py-5 border-b">
            <SectionLabel>Descrição</SectionLabel>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {ticket.description}
            </p>
          </section>

          {/* Checklist */}
          {checklist.length > 0 && (
            <section className="px-6 py-5 border-b">
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Checklist</SectionLabel>
                <span className="text-[10px] text-muted-foreground">{doneCount}/{checklist.length} concluídos</span>
              </div>
              {/* Progress bar */}
              <div className="h-1 bg-muted rounded-full mb-4 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${checklistProgress}%` }} />
              </div>
              <div className="space-y-2">
                {checklist.map(item => (
                  <label key={item.id} className="flex items-center gap-2.5 text-sm cursor-pointer group" data-testid={`checklist-${item.key}`}>
                    <Checkbox
                      checked={item.isDone}
                      onCheckedChange={(checked) => { if (isAdmin) checklistMutation.mutate({ itemId: item.id, isDone: checked === true }); }}
                      disabled={!isAdmin}
                      className="shrink-0"
                    />
                    <span className={`transition-all ${item.isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Attachments */}
          <section className="px-6 py-5 border-b">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Anexos {attachments.length > 0 && `· ${attachments.length}`}</SectionLabel>
              {canUpload && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".jpg,.jpeg,.png,.pdf,.mp4";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      if (file.size > 100 * 1024 * 1024) {
                        toast({ title: "Arquivo muito grande", description: "O arquivo excede o limite de 100 MB.", variant: "destructive" });
                        return;
                      }
                      uploadMutation.mutate(file);
                    };
                    input.click();
                  }}
                  disabled={uploadMutation.isPending}
                  data-testid="button-upload"
                >
                  {uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  Upload
                </Button>
              )}
            </div>
            {attachments.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-6 text-center">
                <Paperclip className="h-5 w-5 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhum anexo</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {attachments.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors group" data-testid={`attachment-${a.id}`}>
                    <div className="shrink-0">{getFileIcon(a.mimeType)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{a.originalName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {a.sizeBytes > 1024 * 1024
                          ? `${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                          : `${(a.sizeBytes / 1024).toFixed(0)} KB`} · {formatDate(a.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href={`/api/tickets/${ticketId}/attachments/${a.id}/download`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`download-${a.id}`}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      {canUpload && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteAttachmentMutation.mutate(a.id)}
                          disabled={deleteAttachmentMutation.isPending}
                          data-testid={`delete-attachment-${a.id}`}
                        >
                          {deleteAttachmentMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Timeline / Comments */}
          <section className="px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <SectionLabel>Atividade</SectionLabel>
              {comments.length > 0 && (
                <span className="text-[10px] text-muted-foreground -mt-3">· {comments.length} comentário{comments.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {timeline.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-center">
                <MessageSquare className="h-5 w-5 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhuma atividade ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {timeline.map((item) => {
                  if (item._kind === "sla_event") {
                    return <SlaEventRow key={`ev-${item.id}`} event={item as TicketEventWithActor} />;
                  }
                  if (item._kind === "image_attachment") {
                    const att = item as AttachmentWithUploader & { _kind: "image_attachment"; _date: Date };
                    const initials = (att.uploadedByName || "?")
                      .split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={`img-${att.id}`} className="flex gap-3">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 text-primary">
                          {initials}
                        </div>
                        <div className="flex-1 max-w-sm rounded-xl border bg-muted/50 overflow-hidden">
                          <a
                            href={`/api/tickets/${ticketId}/attachments/${att.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img
                              src={`/api/tickets/${ticketId}/attachments/${att.id}/download`}
                              alt={att.originalName}
                              className="w-full max-h-64 object-contain bg-muted/30 hover:opacity-90 transition-opacity cursor-zoom-in"
                            />
                          </a>
                          <div className="px-3 py-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{att.originalName}</p>
                              {att.uploadedByName && (
                                <p className="text-[10px] text-muted-foreground">{att.uploadedByName}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(att.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const c = item as CommentWithAuthor & { _kind: "comment"; _date: Date };
                  const initials = (c.authorName || c.authorEmail || "?")
                    .split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <div key={c.id} className="flex gap-3" data-testid={`comment-${c.id}`}>
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${c.isInternal ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-primary/10 text-primary"}`}>
                        {initials}
                      </div>
                      <div className={`flex-1 rounded-xl px-3.5 py-2.5 text-sm ${c.isInternal ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40" : "bg-muted/50 border border-border/60"}`}>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-foreground">
                            {c.authorName || c.authorEmail || "Sistema"}
                          </span>
                          {c.isInternal && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 rounded px-1.5 py-0.5">
                              <Lock className="h-2.5 w-2.5" />
                              Interno
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">{formatDate(c.createdAt)}</span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">{c.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Comment composer */}
            {canComment && (
              <div className="mt-4 pt-4 border-t space-y-3">
                <Textarea
                  placeholder="Escreva um comentário... (Ctrl+V para colar imagem)"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={3}
                  className="resize-none text-sm"
                  data-testid="input-comment"
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of Array.from(items)) {
                      if (item.type.startsWith("image/")) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (!file) return;
                        setPendingImage(file);
                        const reader = new FileReader();
                        reader.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
                        reader.readAsDataURL(file);
                        return;
                      }
                    }
                  }}
                />

                {/* Preview da imagem pendente */}
                {pendingImagePreview && (
                  <div className="relative inline-block">
                    <img
                      src={pendingImagePreview}
                      alt="Preview"
                      className="rounded-lg border max-h-40 max-w-xs object-contain"
                    />
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center"
                      onClick={() => { setPendingImage(null); setPendingImagePreview(null); }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-xs">
                      {pendingImage?.name}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {isAdmin && (
                      <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                        <Checkbox checked={isInternal} onCheckedChange={(v) => setIsInternal(v === true)} data-testid="checkbox-internal" />
                        <Lock className="h-3 w-3" />
                        Comentário interno
                      </label>
                    )}
                    {/* Botão para anexar imagem */}
                    <button
                      type="button"
                      title="Anexar imagem"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*";
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          setPendingImage(file);
                          const reader = new FileReader();
                          reader.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        };
                        input.click();
                      }}
                    >
                      <Image className="h-4 w-4" />
                    </button>
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      // Se há imagem pendente, faz upload primeiro
                      if (pendingImage) {
                        try {
                          await new Promise<void>((resolve, reject) => {
                            uploadMutation.mutate(pendingImage, {
                              onSuccess: () => resolve(),
                              onError: (e) => reject(e),
                            });
                          });
                          setPendingImage(null);
                          setPendingImagePreview(null);
                        } catch {}
                      }
                      // Envia o comentário se tiver texto
                      if (commentBody.trim()) {
                        commentMutation.mutate();
                      }
                    }}
                    disabled={(!commentBody.trim() && !pendingImage) || commentMutation.isPending || uploadMutation.isPending}
                    className="ml-auto gap-1.5"
                    data-testid="button-send-comment"
                  >
                    {(commentMutation.isPending || uploadMutation.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Enviar
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="lg:sticky lg:top-[57px] lg:self-start lg:max-h-[calc(100vh-57px)] lg:overflow-y-auto divide-y">

          {/* Queue position block — admin/coord only */}
          {(isAdmin || isCoordinator) && ticket.status === "NA_FILA" && (
            <div className="p-4 border-b">
              <SectionLabel>Posição na fila</SectionLabel>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 rounded-lg border bg-cyan-50 dark:bg-cyan-950/30 p-3 text-center">
                  <p className="text-3xl font-bold text-cyan-700 dark:text-cyan-300 leading-none">
                    {ticket.queuePosition ?? "—"}
                  </p>
                  {ticket.queueTotal != null && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      de {ticket.queueTotal} na fila
                    </p>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div className="mt-3 space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Mover para posição</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={ticket.queueTotal ?? 999}
                      placeholder={String(ticket.queuePosition ?? "")}
                      value={queueOrderInput}
                      onChange={e => setQueueOrderInput(e.target.value)}
                      className="h-8 text-xs w-24"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={!queueOrderInput || updateMutation.isPending}
                      onClick={() => {
                        const n = parseInt(queueOrderInput, 10);
                        if (!isNaN(n) && n > 0) {
                          updateMutation.mutate({ queueOrder: n });
                          setQueueOrderInput("");
                        }
                      }}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick admin actions */}
          {isAdmin && ticket.status !== "RESOLVIDO" && ticket.status !== "CANCELADO" && (
            <div className="p-4">
              <SectionLabel>Ações rápidas</SectionLabel>
              <div className="space-y-2">
                {(ticket.status === "ABERTO" || ticket.status === "NA_FILA") && (
                  <Button size="sm" className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => updateMutation.mutate({ status: "EM_ANDAMENTO" })} disabled={updateMutation.isPending} data-testid="button-quick-start">
                    <ArrowRight className="h-3.5 w-3.5" />Iniciar atendimento
                  </Button>
                )}
                {(ticket.status === "ABERTO" || ticket.status === "NA_FILA" || ticket.status === "EM_ANDAMENTO") && (
                  <Button size="sm" variant="outline" className="w-full gap-2"
                    onClick={() => setRequestInfoOpen(true)} data-testid="button-request-info">
                    <HelpCircle className="h-3.5 w-3.5" />Pedir informações
                  </Button>
                )}
                {(ticket.status === "EM_ANDAMENTO" || ticket.status === "AGUARDANDO_USUARIO") && (
                  <Button size="sm" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => updateMutation.mutate({ status: "RESOLVIDO" })} disabled={updateMutation.isPending} data-testid="button-quick-resolve">
                    <CheckCircle2 className="h-3.5 w-3.5" />Concluir chamado
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Approval pending */}
          {ticket.status === "AGUARDANDO_APROVACAO" && (
            <div className="p-4">
              <SectionLabel>Aprovação</SectionLabel>
              {approvalData?.isApprover ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">Este chamado requer sua aprovação.</p>
                  <Button size="sm" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => { setApprovalAction("approve"); setApprovalNote(""); setApprovalDialogOpen(true); }} data-testid="button-approve-ticket">
                    <ShieldCheck className="h-3.5 w-3.5" />Aprovar
                  </Button>
                  <Button size="sm" variant="destructive" className="w-full gap-2"
                    onClick={() => { setApprovalAction("reject"); setApprovalNote(""); setApprovalDialogOpen(true); }} data-testid="button-reject-ticket">
                    <XCircle className="h-3.5 w-3.5" />Rejeitar
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aguardando aprovador. SLA pausado.</p>
              )}
            </div>
          )}

          {/* Approval result */}
          {(approvalData?.approval?.status === "APPROVED" || approvalData?.approval?.status === "REJECTED") && ticket.status !== "AGUARDANDO_APROVACAO" && (
            <div className="p-4">
              <SectionLabel>Aprovação</SectionLabel>
              <Badge variant="secondary" className={approvalData.approval.status === "APPROVED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"} data-testid="badge-approval-result">
                {approvalData.approval.status === "APPROVED" ? "Aprovado" : "Rejeitado"}
              </Badge>
              {approvalData.approval.decisionNote && <p className="text-xs text-muted-foreground mt-2">{approvalData.approval.decisionNote}</p>}
              {approvalData.approval.decidedAt && <p className="text-[10px] text-muted-foreground mt-1">{formatDate(approvalData.approval.decidedAt)}</p>}
            </div>
          )}

          {/* SLA */}
          {slaInfo && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>SLA · Ciclo #{slaInfo.cycle.cycleNumber}</SectionLabel>
                <span className={`text-[10px] font-bold ${slaInfo.resColor}`}>{slaInfo.resStatus}</span>
              </div>

              {/* Time progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Tempo utilizado</span>
                  <span>{Math.round(slaInfo.progress)}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${slaInfo.resStatus === "Estourado" ? "bg-red-500" : slaInfo.resStatus === "Em risco" ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${slaInfo.progress}%` }}
                  />
                </div>
              </div>

              <div className="space-y-0.5">
                <InfoRow label="1ª resposta">
                  <div className="flex items-center gap-1">
                    <span className={`text-[11px] font-semibold ${slaInfo.firstColor}`}>{slaInfo.firstStatus}</span>
                    {slaInfo.firstStatus === "Estourado" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-56">
                            <p className="text-xs">A 1ª resposta não foi registrada dentro do prazo estipulado pelo SLA. Isso não afeta necessariamente o prazo de resolução geral.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </InfoRow>
                <InfoRow label="Prazo resp.">{formatDate(slaInfo.cycle.firstResponseDueAt)}</InfoRow>
                <InfoRow label="Prazo resolução">
                  <div className="flex items-center gap-1">
                    <span>{formatDate(slaInfo.cycle.resolutionDueAt)}</span>
                    {isManualDeadline && manualReason && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                          <TooltipContent side="left" className="max-w-48">
                            <p className="font-medium text-xs">Motivo:</p><p className="text-xs">{manualReason}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => setDeadlineDialogOpen(true)} data-testid="button-edit-deadline">
                        <Pencil className="h-2.5 w-2.5" />
                      </Button>
                    )}
                  </div>
                </InfoRow>
              </div>

              {isManualDeadline && (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400" data-testid="badge-manual-deadline">
                  <AlertTriangle className="h-3 w-3" />Prazo ajustado manualmente
                </div>
              )}
              {(ticket.currentCycle as any)?.pausedAt && (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-600" data-testid="badge-sla-paused">
                  <Clock className="h-3 w-3" />SLA pausado
                </div>
              )}
            </div>
          )}

          {/* Detalhes */}
          <div className="p-4">
            <SectionLabel>Detalhes</SectionLabel>
            <div className="space-y-0.5">
              <InfoRow label="Requerente"><span data-testid="text-requester">{ticket.creatorName}</span></InfoRow>
              <InfoRow label="Setor origem"><span data-testid="text-requester-sector">{ticket.requesterSectorName}</span></InfoRow>
              <InfoRow label="Categoria">{ticket.categoryBranch}/{ticket.categoryName}</InfoRow>
              <InfoRow label="Setor destino">{ticket.targetSectorName}</InfoRow>
            </div>
            <div className="mt-3 pt-3 border-t">
              <AssigneesBlock
                assignees={ticket.assignees || []}
                isAdmin={!!isAdmin}
                assignableUsers={assignableUsers}
                onSave={(ids) => assignMutation.mutate(ids)}
                isSaving={assignMutation.isPending}
              />
            </div>
          </div>

          {/* Request data */}
          {ticket.requestData && Object.keys(ticket.requestData).length > 0 && (
            <div className="p-4">
              <SectionLabel>Dados do chamado</SectionLabel>
              <div className="space-y-0.5">
                {Object.entries(ticket.requestData).map(([key, value]) => (
                  <InfoRow key={key} label={key}><span data-testid={`request-data-${key}`}>{String(value)}</span></InfoRow>
                ))}
              </div>
            </div>
          )}

          {/* Admin status/priority */}
          {isAdmin && (
            <div className="p-4 space-y-3">
              <SectionLabel>Configurações</SectionLabel>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</Label>
                <Select value={ticket.status} onValueChange={(v) => updateMutation.mutate({ status: v })}>
                  <SelectTrigger className="h-8 text-xs" data-testid="admin-select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ABERTO">Aberto</SelectItem>
                    <SelectItem value="NA_FILA">Na fila</SelectItem>
                    <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
                    <SelectItem value="AGUARDANDO_USUARIO">Aguardando Usuário</SelectItem>
                    <SelectItem value="AGUARDANDO_APROVACAO">Aguardando Aprovação</SelectItem>
                    <SelectItem value="RESOLVIDO">Resolvido</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Prioridade</Label>
                <Select value={ticket.priority} onValueChange={(v) => updateMutation.mutate({ priority: v })}>
                  <SelectTrigger className="h-8 text-xs" data-testid="admin-select-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXA">Baixa</SelectItem>
                    <SelectItem value="MEDIA">Média</SelectItem>
                    <SelectItem value="ALTA">Alta</SelectItem>
                    <SelectItem value="URGENTE">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs (unchanged) ── */}
      <Dialog open={requestInfoOpen} onOpenChange={setRequestInfoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pedir informações ao solicitante</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Quais informações estão faltando?</Label>
              <Textarea value={requestInfoMessage} onChange={(e) => setRequestInfoMessage(e.target.value)} placeholder="Descreva quais informações ou documentos são necessários..." rows={4} data-testid="input-request-info-message" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={requestInfoMarkAwaiting} onCheckedChange={(v) => setRequestInfoMarkAwaiting(v === true)} data-testid="checkbox-mark-awaiting" />
              Marcar como "Aguardando Usuário" (pausa o SLA)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestInfoOpen(false)}>Cancelar</Button>
            <Button onClick={() => requestInfoMutation.mutate()} disabled={!requestInfoMessage.trim() || requestInfoMutation.isPending} data-testid="button-confirm-request-info">
              {requestInfoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{approvalAction === "approve" ? "Aprovar Chamado" : "Rejeitar Chamado"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{approvalAction === "approve" ? "Observação (opcional)" : "Motivo da rejeição"}</Label>
              <Textarea value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder={approvalAction === "approve" ? "Observação sobre a aprovação..." : "Informe o motivo da rejeição..."} rows={3} data-testid="input-approval-note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => approvalMutation.mutate({ action: approvalAction, note: approvalNote })} disabled={approvalMutation.isPending || (approvalAction === "reject" && !approvalNote.trim())}
              className={approvalAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : ""} variant={approvalAction === "reject" ? "destructive" : "default"} data-testid="button-confirm-approval">
              {approvalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : approvalAction === "approve" ? "Confirmar Aprovação" : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deadlineDialogOpen} onOpenChange={setDeadlineDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Prazo de Conclusão</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Novo prazo</Label>
              <Input type="datetime-local" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} data-testid="input-deadline" />
            </div>
            <div className="space-y-2">
              <Label>Motivo (obrigatório para auditoria)</Label>
              <Textarea value={deadlineReason} onChange={(e) => setDeadlineReason(e.target.value)} placeholder="Motivo da alteração do prazo..." rows={3} data-testid="input-deadline-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeadlineDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => { if (!newDeadline) return; updateMutation.mutate({ resolutionDueAtManual: new Date(newDeadline).toISOString(), resolutionDueAtManualReason: deadlineReason || undefined }); setDeadlineDialogOpen(false); setNewDeadline(""); setDeadlineReason(""); }}
              disabled={!newDeadline || updateMutation.isPending} data-testid="button-save-deadline">
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
