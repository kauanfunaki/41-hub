import { useState } from "react";
import {
  LayoutGrid,
  Monitor,
  Bell,
  CheckCircle2,
  Ticket,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTutorial, type TutorialRole } from "@/hooks/use-tutorial";

interface TutorialStep {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}

const STEPS_USUARIO: TutorialStep[] = [
  {
    icon: LayoutGrid,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "Bem-vindo ao 41 Hub",
    description:
      "O portal corporativo da 41 Tech. Tudo que você precisa está aqui: ferramentas, relatórios e suporte — em um só lugar.",
  },
  {
    icon: Monitor,
    iconBg: "bg-chart-2/10",
    iconColor: "text-chart-2",
    title: "Aplicações & Dashboards",
    description:
      "Acesse aplicações internas e relatórios Power BI diretamente pelo Hub, sem precisar lembrar de URLs ou senhas separadas.",
  },
  {
    icon: Bell,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    title: "Fique por dentro",
    description:
      "O sino no topo da tela mostra notificações em tempo real. Alertas importantes do sistema aparecem automaticamente.",
  },
  {
    icon: CheckCircle2,
    iconBg: "bg-green-500/10",
    iconColor: "text-green-500",
    title: "Tudo pronto!",
    description:
      "Explore o Hub à vontade. Se tiver dúvidas, a Base de Conhecimento tem respostas para as perguntas mais comuns.",
  },
];

const STEPS_COORDENADOR: TutorialStep[] = [
  {
    icon: LayoutGrid,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "Bem-vindo ao 41 Hub",
    description:
      "O portal corporativo da 41 Tech. Tudo que você precisa está aqui: ferramentas, relatórios e gestão de chamados.",
  },
  {
    icon: Monitor,
    iconBg: "bg-chart-2/10",
    iconColor: "text-chart-2",
    title: "Aplicações & Dashboards",
    description:
      "Acesse aplicações internas e relatórios Power BI diretamente pelo Hub, com controle por setor e tipo de acesso.",
  },
  {
    icon: Ticket,
    iconBg: "bg-chart-3/10",
    iconColor: "text-chart-3",
    title: "Gestão de Chamados",
    description:
      "Como Coordenador, você gerencia chamados do seu setor: atribui responsáveis, acompanha o SLA e aprova soluções.",
  },
  {
    icon: Bell,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    title: "Notificações & Alertas",
    description:
      "Receba notificações de novos chamados, mudanças de status e alertas críticos de sistema em tempo real.",
  },
  {
    icon: CheckCircle2,
    iconBg: "bg-green-500/10",
    iconColor: "text-green-500",
    title: "Tudo pronto!",
    description:
      "Você tem acesso às ferramentas de coordenação. Chamados e dashboards estão no menu lateral.",
  },
];

function getSteps(role: TutorialRole): TutorialStep[] {
  return role === "Coordenador" ? STEPS_COORDENADOR : STEPS_USUARIO;
}

export function TutorialModal() {
  const { shouldShow, role, complete, isCompleting } = useTutorial();
  const [step, setStep] = useState(0);

  if (!shouldShow) return null;

  const steps = getSteps(role);
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const Icon = current.icon;

  const handleNext = () => {
    if (isLast) {
      complete();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => complete();

  return (
    <Dialog open={shouldShow} onOpenChange={(open) => { if (!open) complete(); }}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideClose
      >
        {/* Top accent stripe */}
        <div className="h-1 w-full bg-primary" />

        {/* Content */}
        <div className="flex flex-col items-center gap-6 px-8 pt-8 pb-6 text-center">
          {/* Icon bubble */}
          <div
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-2xl",
              current.iconBg,
            )}
          >
            <Icon className={cn("h-10 w-10", current.iconColor)} />
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              {current.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  "rounded-full transition-all duration-200",
                  i === step
                    ? "w-6 h-2 bg-primary"
                    : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                )}
                aria-label={`Ir para passo ${i + 1}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex w-full flex-col gap-2">
            <Button
              onClick={handleNext}
              disabled={isCompleting}
              className="w-full gap-2"
            >
              {isLast ? (
                isCompleting ? "Carregando..." : "Começar a usar o Hub"
              ) : (
                <>
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
            {!isLast && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={isCompleting}
                className="text-muted-foreground text-xs"
              >
                Pular tutorial
              </Button>
            )}
          </div>
        </div>

        {/* Role label */}
        <div className="border-t px-8 py-3 bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            Tutorial para{" "}
            <span className="font-medium text-foreground">{role}</span>
            {" "}· Passo {step + 1} de {steps.length}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
