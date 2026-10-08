import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, Check, X } from "lucide-react";
import { getOnboardingStep } from "@/lib/onboarding";

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const requirements: PasswordRequirement[] = [
  { label: "Mínimo 10 caracteres", test: (p) => p.length >= 10 },
  { label: "Uma letra maiúscula", test: (p) => /[A-Z]/.test(p) },
  { label: "Uma letra minúscula", test: (p) => /[a-z]/.test(p) },
  { label: "Um número", test: (p) => /[0-9]/.test(p) },
  { label: "Um caractere especial (!@#$%^&*)", test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export function PasswordChangeModal() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const shouldShow = getOnboardingStep(user) === "password";

  const allRequirementsMet = requirements.every((r) => r.test(newPassword));
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
  const canSubmit = allRequirementsMet && passwordsMatch && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/local/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Falha ao alterar senha");
      }

      toast({
        title: "Senha alterada",
        description: "Sua nova senha foi definida com sucesso.",
      });

      await refreshUser();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao alterar senha. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <Dialog open={shouldShow} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Defina sua nova senha
          </DialogTitle>
          <DialogDescription>
            Por segurança, você precisa definir uma nova senha antes de continuar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading}
              data-testid="input-new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              data-testid="input-confirm-password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-destructive">As senhas não coincidem</p>
            )}
          </div>

          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-muted-foreground">Requisitos da senha:</p>
            {requirements.map((req, i) => {
              const met = req.test(newPassword);
              return (
                <div key={i} className="flex items-center gap-2">
                  {met ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={met ? "text-green-600" : "text-muted-foreground"}>
                    {req.label}
                  </span>
                </div>
              );
            })}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!canSubmit}
            data-testid="button-save-password"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar nova senha"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
