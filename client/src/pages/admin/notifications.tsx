import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Bell } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { primeAudio, playNotify } from "@/lib/sound";

interface NotificationSetting {
  id: string;
  type: string;
  enabled: boolean;
}

const typeLabels: Record<string, { label: string; description: string }> = {
  ticket_created: {
    label: "Chamado criado",
    description: "Notificar administradores quando um novo chamado é criado",
  },
  ticket_comment: {
    label: "Comentário em chamado",
    description: "Notificar envolvidos quando um comentário é adicionado",
  },
  ticket_status: {
    label: "Mudança de status",
    description: "Notificar envolvidos quando o status de um chamado muda",
  },
  resource_updated: {
    label: "Recurso atualizado",
    description: "Notificar quando um recurso é adicionado ou alterado",
  },
};

export default function AdminNotifications() {
  const { toast } = useToast();

  const { data: settings = [], isLoading } = useQuery<NotificationSetting[]>({
    queryKey: ["/api/admin/notifications/settings"],
  });

  const toggleMutation = useMutation({
    mutationFn: (data: { type: string; enabled: boolean }) =>
      apiRequest("PATCH", "/api/admin/notifications/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/settings"] });
      toast({ title: "Configuração atualizada" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back-admin">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
          <Bell className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie quais tipos de notificação são enviados aos usuários
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Tipos de notificação
          </CardTitle>
          <CardDescription>
            Ative ou desative cada tipo de notificação globalmente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-6 w-10" />
                </div>
              ))}
            </div>
          ) : (
            settings.map((setting) => {
              const info = typeLabels[setting.type] || {
                label: setting.type,
                description: "",
              };
              return (
                <div
                  key={setting.id}
                  className="flex items-center justify-between"
                  data-testid={`notification-setting-${setting.type}`}
                >
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">{info.label}</Label>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </div>
                  <Switch
                    checked={setting.enabled}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ type: setting.type, enabled: checked })
                    }
                    disabled={toggleMutation.isPending}
                    data-testid={`switch-notification-${setting.type}`}
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
