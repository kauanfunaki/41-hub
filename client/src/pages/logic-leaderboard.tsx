import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Medal,
  ArrowLeft,
  Target,
  CheckCircle2,
  Brain,
} from "lucide-react";
import type { Sector } from "@shared/schema";

type Level = "easy" | "medium" | "hard" | "all";

const LEVEL_LABELS: Record<Level, string> = {
  easy: "Fácil",
  medium: "Média",
  hard: "Difícil",
  all: "Todas",
};

type LeaderboardEntry = {
  userId: string;
  userName: string;
  userPhoto: string | null;
  sectorName: string | null;
  correctCount: number;
  totalQuestions: number;
  accuracy: string;
  attempts: number;
  monthKey: string;
  level: string;
};

type PodiumEntry = {
  level: string;
  rank: number;
  userId: string;
  userName: string;
  userPhoto: string | null;
  correctCount: number;
  accuracy: string;
  attempts: number;
};

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function getMonthOptions(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    months.push({ value: key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return months;
}

function getPreviousMonthKey(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
}

// ── Podium config ─────────────────────────────────────────────────────────────

const RANK_CONFIG = {
  1: {
    ringClass: "ring-2 ring-yellow-400 ring-offset-2 ring-offset-background",
    avatarSize: "h-16 w-16",
    nameSize: "text-base font-bold",
    valueSize: "text-3xl font-black",
    stepHeight: 64,
    stepGradient: "linear-gradient(180deg, #F59E0B 0%, #B45309 100%)",
    cardGradient: "linear-gradient(145deg, rgba(245,158,11,0.18) 0%, rgba(180,83,9,0.08) 100%)",
    borderColor: "rgba(245,158,11,0.45)",
    glowColor: "rgba(245,158,11,0.25)",
    label: "1º lugar",
    labelColor: "#F59E0B",
    crown: true,
    delay: 0.15,
  },
  2: {
    ringClass: "ring-2 ring-slate-400 ring-offset-2 ring-offset-background",
    avatarSize: "h-12 w-12",
    nameSize: "text-sm font-semibold",
    valueSize: "text-2xl font-black",
    stepHeight: 40,
    stepGradient: "linear-gradient(180deg, #94A3B8 0%, #475569 100%)",
    cardGradient: "linear-gradient(145deg, rgba(148,163,184,0.15) 0%, rgba(71,85,105,0.06) 100%)",
    borderColor: "rgba(148,163,184,0.4)",
    glowColor: "rgba(148,163,184,0.15)",
    label: "2º lugar",
    labelColor: "#94A3B8",
    crown: false,
    delay: 0.05,
  },
  3: {
    ringClass: "ring-2 ring-amber-700 ring-offset-2 ring-offset-background",
    avatarSize: "h-12 w-12",
    nameSize: "text-sm font-semibold",
    valueSize: "text-2xl font-black",
    stepHeight: 28,
    stepGradient: "linear-gradient(180deg, #B45309 0%, #78350F 100%)",
    cardGradient: "linear-gradient(145deg, rgba(180,83,9,0.15) 0%, rgba(120,53,15,0.06) 100%)",
    borderColor: "rgba(180,83,9,0.4)",
    glowColor: "rgba(180,83,9,0.15)",
    label: "3º lugar",
    labelColor: "#B45309",
    crown: false,
    delay: 0.25,
  },
} as const;

const PODIUM_DISPLAY_ORDER = [2, 1, 3];

function PodiumCard({ entry, rank }: { entry: PodiumEntry; rank: 1 | 2 | 3 }) {
  const cfg = RANK_CONFIG[rank];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: cfg.delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center"
      style={{ flex: rank === 1 ? "0 0 38%" : "0 0 28%" }}
    >
      <div
        className="w-full rounded-t-2xl p-4 flex flex-col items-center gap-3 relative overflow-hidden"
        style={{
          background: cfg.cardGradient,
          border: `1px solid ${cfg.borderColor}`,
          borderBottom: "none",
          boxShadow: `0 0 24px ${cfg.glowColor}, 0 4px 12px rgba(0,0,0,0.08)`,
        }}
      >
        {rank === 1 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(105deg, transparent 40%, rgba(245,158,11,0.12) 50%, transparent 60%)",
              animation: "podiumShimmer 3s ease-in-out infinite",
            }}
          />
        )}

        {cfg.crown && (
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.5, duration: 0.4, type: "spring", stiffness: 200 }}
            className="text-2xl leading-none"
            aria-hidden="true"
          >
            👑
          </motion.div>
        )}

        <span
          className="text-xs font-bold tracking-widest uppercase"
          style={{ color: cfg.labelColor, letterSpacing: "0.12em" }}
        >
          {cfg.label}
        </span>

        <Avatar className={`${cfg.avatarSize} ${cfg.ringClass} shrink-0`}>
          {entry.userPhoto && <AvatarImage src={entry.userPhoto} alt={entry.userName} />}
          <AvatarFallback className="text-xs font-bold bg-muted">
            {getInitials(entry.userName)}
          </AvatarFallback>
        </Avatar>

        <p className={`${cfg.nameSize} text-center text-foreground leading-tight max-w-full px-1 truncate w-full`}>
          {entry.userName.split(" ")[0]}
          <span className="block text-xs font-normal text-muted-foreground truncate">
            {entry.userName.split(" ").slice(1).join(" ")}
          </span>
        </p>

        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-end gap-1">
            <span
              className={`${cfg.valueSize} tabular-nums leading-none`}
              style={{ color: cfg.labelColor }}
            >
              {Number(entry.accuracy).toFixed(0)}%
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {entry.correctCount} acertos · {entry.attempts} tentativa{entry.attempts !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div
        className="w-full flex items-center justify-center rounded-b-lg"
        style={{
          height: cfg.stepHeight,
          background: cfg.stepGradient,
          boxShadow: `0 4px 12px rgba(0,0,0,0.3)`,
        }}
      >
        <span
          className="font-black text-white/80 tracking-tight"
          style={{ fontSize: rank === 1 ? 28 : 22, lineHeight: 1 }}
        >
          {rank}
        </span>
      </div>
    </motion.div>
  );
}

function PodiumSection({ entries, monthLabel }: { entries: PodiumEntry[]; monthLabel: string }) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  const byRank: Record<number, PodiumEntry> = {};
  sorted.forEach((e) => { byRank[e.rank] = e; });

  return (
    <div className="rounded-2xl overflow-hidden bg-card border border-border shadow-lg">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-yellow-500/80">
              Pódio do mês
            </p>
            <p className="text-base font-bold text-foreground">{monthLabel}</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-6">
        <AnimatePresence mode="wait">
          {entries.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-muted-foreground text-center py-8"
            >
              Nenhum resultado no mês anterior.
            </motion.p>
          ) : (
            <motion.div
              key="podium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-end justify-center gap-2 sm:gap-3 pt-2"
            >
              {PODIUM_DISPLAY_ORDER.map((rank) =>
                byRank[rank] ? (
                  <PodiumCard key={rank} entry={byRank[rank]} rank={rank as 1 | 2 | 3} />
                ) : null
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LogicLeaderboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonth = getPreviousMonthKey();

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedLevel, setSelectedLevel] = useState<Level>("all");
  const [tab, setTab] = useState<"global" | "sector">("global");
  const [selectedSectorId, setSelectedSectorId] = useState<string>("all");

  const monthOptions = getMonthOptions();

  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"],
    enabled: !!user,
  });

  const leaderboardParams = new URLSearchParams({ month: selectedMonth });
  if (tab === "sector" && selectedSectorId && selectedSectorId !== "all") {
    leaderboardParams.set("sectorId", selectedSectorId);
  }
  if (selectedLevel !== "all") {
    leaderboardParams.set("level", selectedLevel);
  }

  const { data: leaderboard = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/logic/leaderboard", selectedMonth, selectedLevel, tab, selectedSectorId],
    queryFn: async () => {
      const res = await fetch(`/api/logic/leaderboard?${leaderboardParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: podiumAll = [] } = useQuery<PodiumEntry[]>({
    queryKey: ["/api/logic/podium", prevMonth],
    queryFn: async () => {
      const res = await fetch(`/api/logic/podium?month=${prevMonth}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const hasPodium = podiumAll.length > 0;
  const prevMonthLabel = monthOptions.find((m) => m.value === prevMonth)?.label ?? prevMonth;

  if (!user) return null;

  return (
    <>
      <style>{`
        @keyframes podiumShimmer {
          0%   { transform: translateX(-100%); }
          60%  { transform: translateX(200%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      <div className="max-w-4xl w-full mx-auto py-8 px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/logic")} data-testid="button-back-logic">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold" data-testid="text-leaderboard-title">Ranking de Lógica</h1>
              <p className="text-sm text-muted-foreground">Melhores resultados mensais</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setLocation("/logic")} data-testid="button-go-test">
            <Brain className="h-4 w-4 mr-2" />
            Fazer Teste
          </Button>
        </div>

        {hasPodium && (
          <PodiumSection entries={podiumAll} monthLabel={prevMonthLabel} />
        )}

        {/* Filtros + Tabs */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "global" | "sector")}>
              <TabsList>
                <TabsTrigger value="global" data-testid="tab-global">Global</TabsTrigger>
                <TabsTrigger value="sector" data-testid="tab-sector">Por Setor</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-month">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted border border-border">
                {(["all", "easy", "medium", "hard"] as Level[]).map((lv) => (
                  <button
                    key={lv}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      selectedLevel === lv
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setSelectedLevel(lv)}
                    data-testid={`btn-level-${lv}`}
                  >
                    {LEVEL_LABELS[lv]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {tab === "sector" && (
            <div className="px-4 py-3 border-b">
              <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
                <SelectTrigger className="w-[220px]" data-testid="select-sector">
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os setores</SelectItem>
                  {sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">
                {tab === "global" ? "Ranking Global" : "Ranking por Setor"}
              </h2>
              {selectedLevel !== "all" && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {LEVEL_LABELS[selectedLevel]}
                </span>
              )}
            </div>
            {leaderboard.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {leaderboard.length} participante{leaderboard.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="p-3 space-y-1.5">
            {isLoading ? (
              <div className="space-y-2 p-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-10">
                Nenhum resultado neste período.
              </p>
            ) : (
              leaderboard.map((entry, index) => {
                const rank = index + 1;
                const isMe = entry.userId === user.id;
                const maxAcc = Number(leaderboard[0]?.accuracy ?? 1) || 1;
                const barPct = Math.round((Number(entry.accuracy) / maxAcc) * 100);

                const rankBg: Record<number, string> = {
                  1: "border-yellow-500/30 bg-yellow-500/5",
                  2: "border-slate-400/30 bg-slate-400/5",
                  3: "border-amber-700/30 bg-amber-700/5",
                };
                const rankBarColor: Record<number, string> = {
                  1: "bg-yellow-500",
                  2: "bg-slate-400",
                  3: "bg-amber-600",
                };

                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      isMe
                        ? "border-primary/30 bg-primary/5"
                        : rank <= 3
                        ? rankBg[rank]
                        : "border-border hover:bg-muted/30"
                    }`}
                    data-testid={`leaderboard-entry-${index}`}
                  >
                    <div className="w-7 shrink-0 flex items-center justify-center">
                      {getRankIcon(rank)}
                    </div>

                    <Avatar className="h-9 w-9 shrink-0">
                      {entry.userPhoto && (
                        <AvatarImage src={entry.userPhoto} alt={entry.userName} />
                      )}
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs font-bold">
                        {getInitials(entry.userName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm truncate leading-tight">
                          {entry.userName}
                        </p>
                        {isMe && (
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                            você
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.sectorName && (
                          <span className="text-xs text-muted-foreground truncate">
                            {entry.sectorName}
                          </span>
                        )}
                        {selectedLevel === "all" && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                            {LEVEL_LABELS[entry.level as Level] ?? entry.level}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            rank <= 3 ? (rankBarColor[rank] ?? "bg-primary/60") : "bg-primary/40"
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="flex items-end gap-0.5 justify-end">
                        <Target className="h-3 w-3 text-primary mb-0.5" />
                        <span className="text-xl font-black tabular-nums leading-none">
                          {Number(entry.accuracy).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 justify-end mt-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {entry.correctCount} acertos
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/70">
                        {entry.attempts} tentativa{entry.attempts !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
