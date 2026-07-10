import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Brain,
  Play,
  RotateCcw,
  Trophy,
  Clock,
  Target,
  CheckCircle2,
  Loader2,
  HelpCircle,
  Square,
  X,
  ChevronRight,
} from "lucide-react";

type SessionState = "idle" | "loading" | "running" | "finished";
type Level = "easy" | "medium" | "hard";

type LogicQuestionView = {
  id: string;
  question: string;
  imageUrl?: string | null;
  options: string[];
  difficulty: number;
};

type LogicSessionView = {
  id: string;
  nonce: string;
  startedAt: string;
  expiresAt: string;
};

type LogicScoreResult = {
  id: string;
  correctCount: number;
  totalQuestions: number;
  accuracy: string;
  durationMs: number;
  level: string;
};

const TIMER_DURATION = 180; // 3 minutos para 10 questões

const LEVEL_LABELS: Record<Level, string> = {
  easy: "Fácil",
  medium: "Média",
  hard: "Difícil",
};

export default function LogicTest() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: myStats } = useQuery<{ bestAccuracy: number; bestCorrectCount: number; totalSessions: number } | null>({
    queryKey: ["/api/logic/me/stats"],
    queryFn: () => fetch("/api/logic/me/stats", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: myMonthStats } = useQuery<{ bestAccuracy: number; bestCorrectCount: number; totalSessions: number } | null>({
    queryKey: ["/api/logic/me/stats", currentMonthKey],
    queryFn: () => fetch(`/api/logic/me/stats?month=${currentMonthKey}`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
    retry: false,
  });

  const { data: todayAttempts } = useQuery<{ attemptedLevels: Level[] } | null>({
    queryKey: ["/api/logic/me/today"],
    queryFn: () => fetch("/api/logic/me/today", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    retry: false,
  });
  const attemptedLevelsToday = new Set(todayAttempts?.attemptedLevels ?? []);

  const [state, setState] = useState<SessionState>("idle");
  const [level, setLevel] = useState<Level>("medium");
  const [session, setSession] = useState<LogicSessionView | null>(null);
  const [questions, setQuestions] = useState<LogicQuestionView[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(TIMER_DURATION);
  const [result, setResult] = useState<{ correctCount: number; totalQuestions: number; accuracy: number; score?: LogicScoreResult } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPerfRef = useRef<number | null>(null);

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/logic/session", { level });
      return res.json() as Promise<{ session: LogicSessionView; questions: LogicQuestionView[]; level: Level }>;
    },
    onSuccess: (data) => {
      setSession(data.session);
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(null));
      setCurrent(0);
      setRemainingSeconds(TIMER_DURATION);
      setResult(null);
      startPerfRef.current = performance.now();
      setState("running");

      if (timerRef.current) clearInterval(timerRef.current);
      const startPerf = startPerfRef.current;
      timerRef.current = setInterval(() => {
        const elapsedSec = (performance.now() - startPerf) / 1000;
        const remaining = Math.max(0, TIMER_DURATION - Math.floor(elapsedSec));
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
        }
      }, 250);
    },
    onError: (err: Error) => {
      let msg = "Nenhuma questão disponível. Peça ao admin para cadastrar questões para este nível.";
      const rawBody = err.message?.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(rawBody || "{}");
        if (parsed?.error === "daily_limit_reached") {
          msg = parsed.message || "Você já fez o teste de lógica hoje. Tente novamente amanhã.";
        } else if (parsed?.message || parsed?.error) {
          msg = parsed.message || parsed.error;
        }
      } catch {
        // corpo não era JSON — mantém mensagem padrão
      }
      toast({ title: "Erro", description: msg, variant: "destructive" });
      setState("idle");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { sessionId: string; nonce: string; answers: (number | null)[]; durationMs: number }) => {
      const res = await apiRequest("POST", "/api/logic/submit", data);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || "Erro ao salvar resultado");
      }
      return res.json() as Promise<LogicScoreResult>;
    },
    onSuccess: (score) => {
      setResult((prev) => prev ? { ...prev, score } : null);
      queryClient.invalidateQueries({ queryKey: ["/api/logic/me/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/logic/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/logic/me/today"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Resultado não salvo",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleStart = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startPerfRef.current = null;
    setState("loading");
    startSessionMutation.mutate();
  };

  const finishTest = useCallback((finalAnswers: (number | null)[]) => {
    if (!startPerfRef.current || !session) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const durationMs = performance.now() - startPerfRef.current;
    // O gabarito (correctIndex) nunca é enviado ao cliente — o resultado real
    // só é conhecido após o servidor recalcular a partir das respostas enviadas.
    const totalQuestions = questions.length;

    setResult({ correctCount: 0, totalQuestions, accuracy: 0 });
    setState("finished");

    submitMutation.mutate({
      sessionId: session.id,
      nonce: session.nonce,
      answers: finalAnswers,
      durationMs: Math.round(durationMs),
    });
  }, [questions, session, submitMutation]);

  const handleAnswer = (optionIndex: number) => {
    if (state !== "running") return;
    setAnswers((prev) => {
      const next = [...prev];
      next[current] = optionIndex;
      return next;
    });
  };

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      finishTest(answers);
    }
  };

  const handlePrev = () => {
    if (current > 0) setCurrent((c) => c - 1);
  };

  useEffect(() => {
    if (state === "running" && remainingSeconds <= 0) {
      finishTest(answers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, state]);

  const handleReset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState("idle");
    setSession(null);
    setQuestions([]);
    setAnswers([]);
    setCurrent(0);
    startPerfRef.current = null;
    setRemainingSeconds(TIMER_DURATION);
    setResult(null);
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (!user) return null;

  const currentQuestion = questions[current];
  const answeredCount = answers.filter((a) => a !== null).length;

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold" data-testid="text-logic-title">
                Teste de Lógica
              </h1>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help" data-testid="tooltip-logic-help">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-sm">Raciocínio lógico ajuda a resolver problemas mais rápido e com menos erros no dia a dia. Pratique com questões de múltipla escolha contra o tempo.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">
              Pratique e melhore seu raciocínio
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation("/logic/leaderboard")}
          data-testid="button-leaderboard"
        >
          <Trophy className="h-4 w-4 mr-2" />
          Ranking
        </Button>
      </div>

      {state === "idle" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Main test card */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="h-[3px] bg-primary w-full" />
            <div className="flex flex-col items-center justify-center py-10 px-6 gap-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Brain className="h-8 w-8 text-primary" />
              </div>

              <div className="text-center space-y-1.5 max-w-md">
                <p className="text-lg font-semibold">Pronto para começar?</p>
                <p className="text-sm text-muted-foreground">
                  10 questões de múltipla escolha serão exibidas. Responda o máximo possível corretamente em 3 minutos.
                </p>
              </div>

              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Dificuldade
                </p>
                <div className="flex gap-0.5 p-0.5 rounded-xl bg-muted border border-border">
                  {(["easy", "medium", "hard"] as Level[]).map((lv) => {
                    const done = attemptedLevelsToday.has(lv);
                    return (
                      <button
                        key={lv}
                        onClick={() => setLevel(lv)}
                        className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                          level === lv
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        } ${done ? "opacity-60" : ""}`}
                        data-testid={`button-difficulty-${lv}`}
                      >
                        {LEVEL_LABELS[lv]}
                        {done && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
                {attemptedLevelsToday.has(level) && (
                  <p className="text-xs text-muted-foreground text-center max-w-xs" data-testid="text-level-done-today">
                    Você já fez o teste de lógica no nível {LEVEL_LABELS[level]} hoje. Escolha outro nível ou volte amanhã.
                  </p>
                )}
              </div>

              <Button
                size="lg"
                onClick={handleStart}
                disabled={startSessionMutation.isPending || attemptedLevelsToday.has(level)}
                data-testid="button-start-test"
              >
                {startSessionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Iniciar Teste
              </Button>
            </div>
          </div>

          {/* Side panel: personal stats */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="h-[3px] bg-chart-3 w-full" />
              <div className="p-5">
                <p className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4 text-chart-3" />
                  Suas Estatísticas
                </p>
                {myStats && myStats.totalSessions > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                          {myStats.bestAccuracy != null ? `${myStats.bestAccuracy}%` : "—"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Melhor precisão</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-2xl font-bold tabular-nums text-foreground">{myStats.bestCorrectCount ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Melhor nº acertos</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums text-foreground">{myStats.totalSessions}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Sessões realizadas</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">Nenhum teste realizado ainda.</p>
                    <p className="text-xs text-muted-foreground mt-1">Complete seu primeiro teste para ver suas estatísticas.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="h-[3px] bg-primary w-full" />
              <div className="p-5">
                <p className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  Estatísticas do Mês
                </p>
                {myMonthStats && myMonthStats.totalSessions > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                          {myMonthStats.bestAccuracy != null ? `${myMonthStats.bestAccuracy}%` : "—"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Melhor precisão</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-2xl font-bold tabular-nums text-foreground">{myMonthStats.bestCorrectCount ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Melhor nº acertos</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums text-foreground">{myMonthStats.totalSessions}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Sessões realizadas</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">Nenhum teste este mês ainda.</p>
                    <p className="text-xs text-muted-foreground mt-1">Faça um teste para começar a pontuar no mês.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {state === "loading" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-[160px] w-full rounded-xl" />
          <Skeleton className="h-[220px] w-full rounded-xl" />
        </div>
      )}

      {state === "running" && currentQuestion && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <Badge variant={remainingSeconds <= 20 ? "destructive" : "secondary"} data-testid="badge-countdown">
                <Clock className="h-3 w-3 mr-1" />
                {formatCountdown(remainingSeconds)}
              </Badge>
              <Badge variant="secondary">
                Questão {current + 1} / {questions.length}
              </Badge>
              <Badge variant="outline">
                {LEVEL_LABELS[level]}
              </Badge>
              <Badge variant="outline">
                {answeredCount} respondida{answeredCount !== 1 ? "s" : ""}
              </Badge>
            </div>
            <Button variant="outline" onClick={handleReset} data-testid="button-reset-test">
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="h-[3px] bg-primary w-full" />
            <div className="p-6 space-y-5">
              <p className="text-lg font-medium leading-relaxed" data-testid="text-question">
                {currentQuestion.question}
              </p>
              {currentQuestion.imageUrl && (
                <div className="rounded-lg border bg-muted/30 overflow-hidden flex items-center justify-center">
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Imagem da questão"
                    className="max-h-72 w-auto object-contain"
                    data-testid="image-question"
                  />
                </div>
              )}
              <div className="grid gap-2.5">
                {currentQuestion.options.map((opt, i) => {
                  const selected = answers[current] === i;
                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      className={`text-left px-4 py-3 rounded-lg border transition-all flex items-center gap-3 ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:bg-muted/50 text-foreground"
                      }`}
                      data-testid={`option-${i}`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                          selected ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/40 text-muted-foreground"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-sm">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t px-6 py-4 flex items-center justify-between">
              <Button variant="outline" onClick={handlePrev} disabled={current === 0} data-testid="button-prev-question">
                Anterior
              </Button>
              <Button onClick={handleNext} data-testid="button-next-question">
                {current < questions.length - 1 ? (
                  <>
                    Próxima
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Finalizar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {state === "finished" && result && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div
            className={`h-[3px] w-full ${
              result.score && Number(result.score.accuracy) >= 80
                ? "bg-yellow-500"
                : result.score && Number(result.score.accuracy) >= 50
                ? "bg-primary"
                : "bg-muted-foreground/30"
            }`}
          />

          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h2 className="text-base font-semibold">Resultado</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                {LEVEL_LABELS[level]}
              </span>
            </div>
            {result.score && (
              <span
                className={`text-sm font-semibold ${
                  Number(result.score.accuracy) >= 80
                    ? "text-yellow-600 dark:text-yellow-400"
                    : Number(result.score.accuracy) >= 50
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {Number(result.score.accuracy) >= 80
                  ? "Excelente! 🏆"
                  : Number(result.score.accuracy) >= 50
                  ? "Bom resultado!"
                  : "Continue praticando!"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 divide-x">
            <div className="text-center px-4 py-6">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-3 text-primary" />
              <p className="text-4xl font-black tabular-nums leading-none" data-testid="text-result-correct">
                {result.score ? result.score.correctCount : "—"}/{result.score ? result.score.totalQuestions : result.totalQuestions}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Acertos</p>
            </div>
            <div className="text-center px-4 py-6">
              <Target className="h-5 w-5 mx-auto mb-3 text-green-500" />
              <p className="text-4xl font-black tabular-nums leading-none" data-testid="text-result-accuracy">
                {result.score ? `${result.score.accuracy}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Precisão</p>
            </div>
            <div className="text-center px-4 py-6">
              <Clock className="h-5 w-5 mx-auto mb-3 text-chart-4" />
              <p className="text-4xl font-black tabular-nums leading-none" data-testid="text-result-time">
                {result.score ? `${Math.round(result.score.durationMs / 1000)}s` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Tempo</p>
            </div>
          </div>

          <div className="border-t px-6 py-4 flex flex-col gap-3 items-center">
            {submitMutation.isPending && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando resultado...
              </p>
            )}
            {result.score && (
              <p className="text-sm text-green-600 dark:text-green-400">
                ✓ Resultado salvo no ranking mensal ({LEVEL_LABELS[level]})
              </p>
            )}
            <div className="flex gap-3 flex-wrap justify-center">
              <Button onClick={handleStart} data-testid="button-retry-test">
                <RotateCcw className="h-4 w-4 mr-2" />
                Tentar Novamente
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/logic/leaderboard")}
                data-testid="button-view-leaderboard"
              >
                <Trophy className="h-4 w-4 mr-2" />
                Ver Ranking
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
