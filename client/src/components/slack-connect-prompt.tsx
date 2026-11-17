import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, Slack } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { slackConnectionKey, useSlackConnection } from "@/hooks/use-slack-connection";

export function SlackConnectPrompt() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isFetching } = useSlackConnection();
  const [closed, setClosed] = useState(false);
  const [dontRemindAgain, setDontRemindAgain] = useState(false);
  const actionInProgress = useRef(false);

  const preferenceMutation = useMutation({
    mutationFn: (dismissed: boolean) => apiRequest("PATCH", "/api/users/me/slack/reminder", { dismissed }),
    onSuccess: (_, dismissed) => {
      queryClient.setQueryData(slackConnectionKey(user?.id), (previous: typeof data) =>
        previous ? { ...previous, sessionDismissed: true, reminderDismissed: dismissed || previous.reminderDismissed } : previous,
      );
    },
  });

  const finish = async (connect: boolean) => {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    try {
      // A temporary dismissal lives in the login session, including reloads
      // and the redirect back from OAuth. The permanent choice lives in users.
      await preferenceMutation.mutateAsync(dontRemindAgain);
      setClosed(true);
      if (connect) window.location.href = "/api/users/me/slack/connect";
    } catch {
      toast({
        title: "Não foi possível salvar a preferência",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    } finally {
      actionInProgress.current = false;
    }
  };

  const open = !closed && !isFetching && !!data?.configured &&
    !data.connected && !data.reminderDismissed && !data.sessionDismissed;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) void finish(false); }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-slack-connect-prompt">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Slack className="h-5 w-5" />
          </div>
          <DialogTitle>Novidade: atualizações de chamados no Slack</DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            Conecte sua conta para receber mensagens privadas sobre comentários, mudanças de status,
            atribuições de responsabilidade e solicitações de informações nos chamados em que você participa.
            Você não recebe avisos sobre as alterações que fizer.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>A conexão é opcional. As notificações no 41Hub continuam disponíveis. Você pode conectar ou desconectar o Slack depois, em Meu Perfil.</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="dont-remind-slack" checked={dontRemindAgain}
            disabled={preferenceMutation.isPending}
            onCheckedChange={(checked) => setDontRemindAgain(checked === true)}
            data-testid="checkbox-dont-remind-slack" />
          <Label htmlFor="dont-remind-slack" className="cursor-pointer text-sm font-normal text-muted-foreground">
            Não lembrar mais
          </Label>
        </div>
        <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => void finish(false)} disabled={preferenceMutation.isPending} data-testid="button-close-slack-prompt">
            {preferenceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agora não
          </Button>
          <Button onClick={() => void finish(true)} disabled={preferenceMutation.isPending} data-testid="button-connect-slack-prompt">
            <Slack className="mr-2 h-4 w-4" />Conectar Slack agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
