import { useState } from "react";
import { PageContainer } from "@/components/page-container";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Bell,
  Plus,
  Trash2,
  Edit,
  Power,
  PowerOff,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EmptyState } from "@/components/empty-state";
import { SeverityBadge, SEVERITY_CONFIG } from "@/components/severity-badge";
import type { AlertSeverity } from "@/components/severity-badge";
import { cn } from "@/lib/utils";

interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

export default function AdminAlerts() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AlertItem | null>(null);
  const [form, setForm] = useState({
    title: "",
    message: "",
    severity: "info" as AlertSeverity,
    isActive: true,
  });

  const { data: alertsRaw, isLoading } = useQuery<AlertItem[] | unknown>({
    queryKey: ["/api/admin/alerts"],
    retry: false,
  });
  const alerts: AlertItem[] = Array.isArray(alertsRaw) ? alertsRaw : [];

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/admin/alerts", data),
    onSuccess: () => {
      toast({ title: "Alerta publicado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setDialogOpen(false);
    },
    onError: async (err: any) => {
      let msg = "Erro ao criar alerta";
      try {
        const body = await err?.response?.json?.();
        if (body?.error) msg = body.error;
      } catch (_) {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof form> }) =>
      apiRequest("PATCH", `/api/admin/alerts/${id}`, data),
    onSuccess: () => {
      toast({ title: "Alerta atualizado" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setDialogOpen(false);
    },
    onError: () =>
      toast({ title: "Erro ao atualizar alerta", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/alerts/${id}`),
    onSuccess: () => {
      toast({ title: "Alerta removido" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
    onError: () =>
      toast({ title: "Erro ao remover alerta", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", message: "", severity: "info", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (alert: AlertItem) => {
    setEditing(alert);
    setForm({
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      isActive: alert.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" });
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleActive = (alert: AlertItem) => {
    updateMutation.mutate({ id: alert.id, data: { isActive: !alert.isActive } });
  };

  const activeAlerts = alerts.filter((a) => a.isActive);

  return (
    <PageContainer className="flex flex-col gap-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
            <ShieldAlert className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Gestão de Alertas</h1>
            <p className="text-sm text-muted-foreground">
              Crie e gerencie alertas publicados para os usuários
            </p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo alerta
        </Button>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            <Bell className="h-4 w-4 mr-2" />
            Ativos ({activeAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="all">Todos ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3 mt-4">
          <AlertList
            alerts={activeAlerts}
            loading={isLoading}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
            onToggle={toggleActive}
          />
        </TabsContent>

        <TabsContent value="all" className="space-y-3 mt-4">
          <AlertList
            alerts={alerts}
            loading={isLoading}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
            onToggle={toggleActive}
          />
        </TabsContent>
      </Tabs>

      {/* Create / Edit sheet */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent className="flex flex-col sm:max-w-lg p-0" data-testid="sheet-alert-form">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              {(() => {
                const cfg = SEVERITY_CONFIG[form.severity] ?? SEVERITY_CONFIG.info;
                const SevIcon = cfg.icon;
                return (
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg shrink-0", cfg.iconBg)}>
                    <SevIcon className={cn("h-5 w-5", cfg.iconColor)} />
                  </div>
                );
              })()}
              <div>
                <SheetTitle>{editing ? "Editar alerta" : "Novo alerta"}</SheetTitle>
                <SheetDescription>
                  {editing ? "Altere o alerta publicado" : "Publique um alerta para todos os usuários"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Severidade */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Severidade</Label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: "info" as AlertSeverity, label: "Informação" },
                    { value: "warning" as AlertSeverity, label: "Atenção" },
                    { value: "critical" as AlertSeverity, label: "Crítico" },
                  ]).map((opt) => {
                    const cfg = SEVERITY_CONFIG[opt.value];
                    const SevIcon = cfg.icon;
                    const selected = form.severity === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, severity: opt.value }))}
                        data-testid={`severity-btn-${opt.value}`}
                        className={cn(
                          "rounded-xl border-2 p-3 flex flex-col items-center gap-2 transition-all",
                          selected
                            ? cn(cfg.iconBg, cfg.iconColor, "border-current")
                            : "border-border text-muted-foreground hover:border-muted-foreground/60"
                        )}
                      >
                        <SevIcon className="h-5 w-5" />
                        <span className="text-xs font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Conteúdo */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conteúdo</Label>
                <div className="space-y-2">
                  <Label htmlFor="alert-title">Título</Label>
                  <Input
                    id="alert-title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex: Manutenção programada"
                    maxLength={200}
                    data-testid="input-alert-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alert-message">Mensagem</Label>
                  <Textarea
                    id="alert-message"
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="Descreva o alerta com detalhes..."
                    rows={4}
                    maxLength={2000}
                    data-testid="input-alert-message"
                  />
                  <p className="text-xs text-muted-foreground">{form.message.length}/2000 caracteres</p>
                </div>
              </div>

              <Separator />

              {/* Publicação */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Publicação</Label>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Alerta ativo</p>
                    <p className="text-xs text-muted-foreground">Visível e notificado aos usuários</p>
                  </div>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                    data-testid="switch-alert-active"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-alert"
              >
                {editing ? "Salvar alterações" : "Publicar alerta"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}

// ── Alert List ────────────────────────────────────────────────────────────────

function AlertList({
  alerts,
  loading,
  onEdit,
  onDelete,
  onToggle,
}: {
  alerts: AlertItem[];
  loading: boolean;
  onEdit: (a: AlertItem) => void;
  onDelete: (id: string) => void;
  onToggle: (a: AlertItem) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-card overflow-hidden flex items-stretch"
          >
            <div className="w-1 shrink-0 bg-muted" />
            <div className="flex items-start gap-3 p-4 flex-1">
              <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="Nenhum alerta encontrado"
        description="Crie um novo alerta usando o botão acima."
      />
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
        const SevIcon = cfg.icon;
        return (
          <div
            key={alert.id}
            className={cn(
              "flex items-stretch rounded-xl border bg-card overflow-hidden",
              !alert.isActive && "opacity-60",
            )}
          >
            {/* Severity stripe */}
            <div className={`w-1 shrink-0 ${cfg.stripe}`} />

            <div className="flex items-start gap-3 p-4 flex-1 min-w-0">
              {/* Icon */}
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${cfg.iconBg}`}
              >
                <SevIcon className={`h-4 w-4 ${cfg.iconColor}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-semibold text-sm">{alert.title}</p>
                  {!alert.isActive && (
                    <Badge variant="outline" className="text-xs">Inativo</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={alert.severity} />
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                  {alert.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(alert.createdAt))}
                  {alert.createdByName && ` · por ${alert.createdByName}`}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={alert.isActive ? "Desativar" : "Ativar"}
                  onClick={() => onToggle(alert)}
                >
                  {alert.isActive ? (
                    <PowerOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Power className="h-4 w-4 text-green-500" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(alert)}
                >
                  <Edit className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onDelete(alert.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
