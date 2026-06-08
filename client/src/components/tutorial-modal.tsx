import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTutorial } from "@/hooks/use-tutorial";

interface TutorialStep {
  page: string;
  targetSelector?: string;
  title: string;
  description: string;
}

const STEPS_USUARIO: TutorialStep[] = [
  {
    page: "/",
    title: "👋 Bem-vindo ao 41 Hub!",
    description:
      "Seja bem-vindo ao portal corporativo da 41 Tech. Vamos te mostrar as principais seções em poucos passos. Use os botões abaixo para navegar.",
  },
  {
    page: "/",
    targetSelector: "[data-sidebar='sidebar']",
    title: "Menu de Navegação",
    description:
      "A barra lateral te leva a qualquer seção: Início, Aplicações, Dashboards, Base de Conhecimento, Alertas e muito mais.",
  },
  {
    page: "/apps",
    targetSelector: "[data-tutorial='apps-grid']",
    title: "Aplicações",
    description:
      "Acesse todas as aplicações internas da empresa aqui. Clique em qualquer app para abri-lo diretamente no portal.",
  },
  {
    page: "/dashboards",
    targetSelector: "[data-tutorial='dashboards-grid']",
    title: "Dashboards",
    description:
      "Aqui ficam os relatórios e dashboards. Clique para visualizá-los sem precisar abrir outro sistema.",
  },
  {
    page: "/kb",
    targetSelector: "[data-tutorial='kb-search']",
    title: "Base de Conhecimento",
    description:
      "Encontre respostas para dúvidas, tutoriais e documentação interna. Pesquise por qualquer assunto ou navegue pelas categorias.",
  },
  {
    page: "/alerts",
    targetSelector: "[data-tutorial='alerts-list']",
    title: "Alertas do Sistema",
    description:
      "Alertas sobre o funcionamento dos sistemas da empresa aparecem aqui. Fique de olho para não perder avisos importantes.",
  },
  {
    page: "/",
    targetSelector: "[data-tutorial='notification-bell']",
    title: "Notificações em Tempo Real",
    description:
      "O sininho no topo exibe notificações de chamados e avisos do sistema. Um badge vermelho indica itens não lidos.",
  },
  {
    page: "/",
    title: "🎉 Pronto para começar!",
    description:
      "Você conhece os principais recursos do Hub. Explore à vontade e, se precisar de ajuda, a Base de Conhecimento está sempre disponível.",
  },
];

const STEPS_COORDENADOR: TutorialStep[] = [
  {
    page: "/",
    title: "👋 Bem-vindo ao 41 Hub!",
    description:
      "Como Coordenador, você tem acesso a ferramentas de gestão além dos recursos padrão. Vamos te guiar pelas seções mais importantes.",
  },
  {
    page: "/",
    targetSelector: "[data-sidebar='sidebar']",
    title: "Menu de Navegação",
    description:
      "A barra lateral organiza todas as seções. Como Coordenador, você verá o menu Chamados com contadores de pendências e acesso a Análises.",
  },
  {
    page: "/apps",
    targetSelector: "[data-tutorial='apps-grid']",
    title: "Aplicações & Dashboards",
    description:
      "Acesse aplicações internas e relatórios disponíveis para seu perfil. Marque favoritos para acesso rápido na tela inicial.",
  },
  {
    page: "/tickets",
    targetSelector: "[data-tutorial='tickets-tabs']",
    title: "Abas de Chamados",
    description:
      "Use as abas para filtrar por status: Ativos, Aguardando sua resposta ou Histórico. O número indica chamados pendentes de ação.",
  },
  {
    page: "/tickets",
    targetSelector: "[data-tutorial='tickets-list']",
    title: "Gestão de Chamados",
    description:
      "Clique em qualquer chamado para ver detalhes, atribuir responsáveis, responder mensagens e acompanhar o SLA.",
  },
  {
    page: "/analytics",
    targetSelector: "[data-tutorial='analytics-kpi']",
    title: "Analytics & KPIs",
    description:
      "Acompanhe métricas da equipe: tickets por período, SLA cumprido, carga por colaborador e tendências ao longo do tempo.",
  },
  {
    page: "/",
    targetSelector: "[data-tutorial='notification-bell']",
    title: "Notificações em Tempo Real",
    description:
      "O sininho exibe notificações de novos chamados, mudanças de status e alertas críticos. Mantenha-o sempre verificado.",
  },
  {
    page: "/",
    title: "🎉 Pronto para gerenciar!",
    description:
      "Você tem acesso completo ao Hub. Chamados, analytics e configurações ficam no menu lateral. Bom trabalho!",
  },
];

export function TutorialModal() {
  const { shouldShow, role, complete, isCompleting } = useTutorial();
  const [step, setStep] = useState(0);
  const [, navigate] = useLocation();

  // Save location ONCE when the component first renders (before tutorial navigates away)
  const [savedLocation] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/"
  );

  const steps = role === "Coordenador" ? STEPS_COORDENADOR : STEPS_USUARIO;
  const current = steps[step];
  const isLast = step === steps.length - 1;

  // Navigate to the first step's page when tutorial first becomes visible
  useEffect(() => {
    if (shouldShow) {
      navigate(steps[0].page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow]);

  // Remove old highlight and apply new one after each step change
  useEffect(() => {
    // Always clear old highlights first
    document.querySelectorAll(".tutorial-highlight").forEach((el) => {
      el.classList.remove("tutorial-highlight");
    });

    if (!current?.targetSelector) return;

    // Wait for the new page to render before querying the DOM
    const timer = setTimeout(() => {
      const el = document.querySelector(current.targetSelector!);
      if (el) {
        el.classList.add("tutorial-highlight");
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 380);

    return () => clearTimeout(timer);
  }, [step, current?.targetSelector]);

  // Clean up all highlights when the component unmounts
  useEffect(() => {
    return () => {
      document.querySelectorAll(".tutorial-highlight").forEach((el) => {
        el.classList.remove("tutorial-highlight");
      });
    };
  }, []);

  const goToStep = (targetStep: number) => {
    const nextStepData = steps[targetStep];
    if (nextStepData.page !== steps[step].page) {
      navigate(nextStepData.page);
    }
    setStep(targetStep);
  };

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      goToStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (step > 0) goToStep(step - 1);
  };

  const handleFinish = () => {
    document.querySelectorAll(".tutorial-highlight").forEach((el) => {
      el.classList.remove("tutorial-highlight");
    });
    navigate(savedLocation);
    complete();
  };

  if (!shouldShow) return null;

  return (
    <>
      {/* Semi-transparent backdrop — pointer-events-none so user can see and interact with the page */}
      <div
        className="fixed inset-0 z-40 bg-black/15 pointer-events-none"
        aria-hidden="true"
      />

      {/* Floating tutorial card — bottom center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
        <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden">
          {/* Primary accent stripe */}
          <div className="h-1 bg-primary" />

          <div className="px-6 pt-5 pb-2">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tutorial · {step + 1} de {steps.length}
                </span>
              </div>
              <button
                onClick={handleFinish}
                className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5"
                aria-label="Fechar tutorial"
                title="Pular tutorial"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Step title and description */}
            <h3 className="text-base font-semibold text-foreground mb-2 leading-snug">
              {current.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* Progress dots — clickable to jump to any step */}
          <div className="flex items-center justify-center gap-1.5 py-4">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => goToStep(i)}
                aria-label={`Ir para passo ${i + 1}`}
                className={cn(
                  "rounded-full transition-all duration-200",
                  i === step
                    ? "w-5 h-2 bg-primary"
                    : i < step
                      ? "w-2 h-2 bg-primary/40"
                      : "w-2 h-2 bg-muted-foreground/20 hover:bg-muted-foreground/40",
                )}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 px-6 pb-5">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                className="gap-1.5"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Voltar
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              disabled={isCompleting}
              className={cn("gap-1.5", step === 0 ? "w-full" : "flex-1")}
            >
              {isLast ? (
                isCompleting ? "Finalizando..." : "Começar a usar ✓"
              ) : (
                <>
                  Próximo
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
