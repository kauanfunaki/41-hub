import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Bookmark,
  BookmarkCheck,
  Share2,
  ExternalLink,
  Newspaper,
  ChevronLeft,
  ChevronRight,
  Users,
  User,
  Loader2,
  Globe,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Sector } from "@shared/schema";

type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  whyMatters: string | null;
  impactLevel: string | null;
  sourceName: string | null;
  sourceUrl: string;
  category: string;
  sectorTags: string[];
  batchSlot: string | null;
  fetchedDate: string;
  publishedAt: string | null;
  createdAt: string;
  isFavorited: boolean;
  sharedByName: string | null;
  shareMessage: string | null;
};

type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  sectorName?: string;
};

const IMPACT_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ALTO: { label: "Alto impacto", variant: "destructive" },
  MÉDIO: { label: "Impacto médio", variant: "default" },
  BAIXO: { label: "Baixo impacto", variant: "secondary" },
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFetchedDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

// ── Share Dialog ─────────────────────────────────────────────────────────────

function ShareDialog({
  article,
  onClose,
}: {
  article: NewsArticle;
  onClose: () => void;
}) {
  const [shareTarget, setShareTarget] = useState<"user" | "sector">("sector");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"],
    staleTime: 60_000,
  });

  const { data: users = [] } = useQuery<DirectoryUser[]>({
    queryKey: ["/api/users/directory", { all: true }],
    queryFn: () =>
      fetch("/api/users/directory?all=true", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const shareMutation = useMutation({
    mutationFn: (body: object) =>
      apiRequest("POST", `/api/news/${article.id}/share`, body),
    onSuccess: () => {
      toast({ title: "Notícia compartilhada!" });
      qc.invalidateQueries({ queryKey: ["/api/news"] });
      onClose();
    },
    onError: () => {
      toast({ title: "Erro ao compartilhar", variant: "destructive" });
    },
  });

  const canSubmit =
    shareTarget === "user" ? !!selectedUserId : !!selectedSectorId;

  function handleSubmit() {
    shareMutation.mutate({
      sharedToUserId: shareTarget === "user" ? selectedUserId : undefined,
      sharedToSectorId: shareTarget === "sector" ? selectedSectorId : undefined,
      message: shareMessage.trim() || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar notícia</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground line-clamp-2">{article.title}</p>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={shareTarget === "sector" ? "default" : "outline"}
              size="sm"
              onClick={() => setShareTarget("sector")}
            >
              <Users className="h-4 w-4 mr-1" />
              Setor
            </Button>
            <Button
              variant={shareTarget === "user" ? "default" : "outline"}
              size="sm"
              onClick={() => setShareTarget("user")}
            >
              <User className="h-4 w-4 mr-1" />
              Usuário
            </Button>
          </div>

          {shareTarget === "sector" ? (
            <div className="space-y-1.5">
              <Label>Setor destinatário</Label>
              <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Usuário destinatário</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o usuário" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Mensagem (opcional)</Label>
            <Textarea
              placeholder="Adicione um comentário..."
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || shareMutation.isPending}>
            {shareMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Compartilhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Article Card ─────────────────────────────────────────────────────────────

function ArticleCard({
  article,
  onShare,
}: {
  article: NewsArticle;
  onShare: (a: NewsArticle) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const favMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        article.isFavorited ? "DELETE" : "POST",
        `/api/news/${article.id}/favorite`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/news"] });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar favorito", variant: "destructive" });
    },
  });

  const impact = IMPACT_CONFIG[article.impactLevel ?? "MÉDIO"] ?? IMPACT_CONFIG["MÉDIO"];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow">
      {/* Top row: badges + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-xs font-normal">
            {article.category}
          </Badge>
          <Badge variant={impact.variant} className="text-xs font-normal">
            {impact.label}
          </Badge>
          {article.sharedByName && (
            <Badge variant="secondary" className="text-xs font-normal">
              Compartilhado por {article.sharedByName}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => favMutation.mutate()}
            disabled={favMutation.isPending}
          >
            {article.isFavorited ? (
              <BookmarkCheck className="h-4 w-4 text-primary" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onShare(article)}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-sm leading-snug">{article.title}</h3>

      {/* Summary */}
      <p className="text-sm text-muted-foreground leading-relaxed">{article.summary}</p>

      {/* Why it matters */}
      {article.whyMatters && (
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Por que importa</p>
          <p className="text-sm leading-relaxed">{article.whyMatters}</p>
        </div>
      )}

      {/* Share message */}
      {article.shareMessage && (
        <div className="rounded-md border-l-2 border-primary/40 pl-3">
          <p className="text-xs text-muted-foreground italic">"{article.shareMessage}"</p>
        </div>
      )}

      {/* Footer: source + link */}
      <div className="flex items-center justify-between pt-1">
        <div className="text-xs text-muted-foreground">
          {article.sourceName && <span>{article.sourceName}</span>}
          {article.publishedAt && (
            <span className="ml-2">{formatDate(article.publishedAt)}</span>
          )}
        </div>
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Ler mais <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const userSectorName = user?.roles?.[0]?.sectorName ?? "";
  const [selectedSector, setSelectedSector] = useState<string>(userSectorName || "todos");
  const [dateOffset, setDateOffset] = useState(0); // 0 = today, 1 = yesterday, etc.
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [geralOnly, setGeralOnly] = useState(false);
  const [sharedOnly, setSharedOnly] = useState(false);
  const [shareArticle, setShareArticle] = useState<NewsArticle | null>(null);

  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dateOffset);
    return d.toISOString().slice(0, 10);
  }, [dateOffset]);

  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"],
    staleTime: 60_000,
  });

  const { data: availableDates = [] } = useQuery<string[]>({
    queryKey: ["/api/news/dates"],
    staleTime: 5 * 60_000,
  });

  const triviaQuery = useQuery<{ worldDay: string | null }>({
    queryKey: ["/api/geral/trivia", targetDate],
    queryFn: () =>
      fetch(`/api/geral/trivia?date=${targetDate}`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 30 * 60_000,
  });

  const dollarQuery = useQuery<string | null>({
    queryKey: ["/external/dollar", targetDate],
    queryFn: async () => {
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      try {
        if (targetDate >= todayLocal) {
          const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
          const data = await r.json();
          const bid = parseFloat(data?.USDBRL?.bid ?? "0");
          return bid > 0 ? bid.toFixed(2).replace(".", ",") : null;
        } else {
          const endCompact = targetDate.replace(/-/g, "");
          const startDate = new Date(`${targetDate}T12:00:00`);
          startDate.setDate(startDate.getDate() - 7);
          const startCompact = startDate.toISOString().slice(0, 10).replace(/-/g, "");
          const r = await fetch(`https://economia.awesomeapi.com.br/json/daily/USD-BRL/1?start_date=${startCompact}&end_date=${endCompact}`);
          const data = await r.json();
          const item = Array.isArray(data) ? data[0] : null;
          return item?.bid ? parseFloat(item.bid).toFixed(2).replace(".", ",") : null;
        }
      } catch {
        return null;
      }
    },
    staleTime: 30 * 60_000,
  });

  const newsQuery = useQuery<NewsArticle[]>({
    queryKey: ["/api/news", { sector: selectedSector, date: targetDate, favorites: favoritesOnly, geral: geralOnly, shared: sharedOnly }],
    queryFn: () => {
      if (sharedOnly) {
        return fetch("/api/news?shared=true", { credentials: "include" }).then((r) => r.json());
      }
      const params = new URLSearchParams({ date: targetDate });
      if (geralOnly) {
        params.set("geral", "true");
      } else {
        if (selectedSector !== "todos") params.set("sector", selectedSector);
        if (favoritesOnly) params.set("favorites", "true");
      }
      return fetch(`/api/news?${params}`, { credentials: "include" }).then((r) => r.json());
    },
    staleTime: 2 * 60_000,
  });

  const articles = newsQuery.data ?? [];

  const morningArticles = articles.filter((a) => a.batchSlot === "08:30" || (!a.batchSlot && true));
  const afternoonArticles = articles.filter((a) => a.batchSlot === "13:30");
  const hasSplitSlots = morningArticles.some((a) => a.batchSlot) || afternoonArticles.length > 0;

  const dateLabel = dateOffset === 0
    ? "Hoje"
    : dateOffset === 1
    ? "Ontem"
    : formatFetchedDate(targetDate);

  const canGoBack = dateOffset < 6;
  const canGoForward = dateOffset > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Notícias</h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Geral toggle */}
            <Button
              variant={geralOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setGeralOnly((v) => !v);
                setFavoritesOnly(false);
                setSharedOnly(false);
              }}
            >
              <Globe className="h-4 w-4 mr-1.5" />
              Geral
            </Button>

            {/* Favorites toggle */}
            <Button
              variant={favoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFavoritesOnly((v) => !v);
                setGeralOnly(false);
                setSharedOnly(false);
              }}
            >
              <BookmarkCheck className="h-4 w-4 mr-1.5" />
              Favoritos
            </Button>

            {/* Shared toggle */}
            <Button
              variant={sharedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSharedOnly((v) => !v);
                setGeralOnly(false);
                setFavoritesOnly(false);
              }}
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              Compartilhados
            </Button>

            {/* Sector filter — oculto quando Geral, Favoritos ou Compartilhados está ativo */}
            {!geralOnly && !favoritesOnly && !sharedOnly && (
              <Select value={selectedSector} onValueChange={setSelectedSector}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os setores</SelectItem>
                  {sectors.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                      {s.name === userSectorName && (
                        <span className="ml-1 text-muted-foreground text-xs">(seu setor)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {/* Date navigation — oculto na view Compartilhados */}
      {!sharedOnly && <div className="border-b bg-muted/30 px-6 py-2 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canGoBack}
          onClick={() => setDateOffset((v) => v + 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[140px] text-center">{dateLabel}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canGoForward}
          onClick={() => setDateOffset((v) => v - 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {availableDates.length > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            {availableDates.length} dia{availableDates.length !== 1 ? "s" : ""} com notícias
          </span>
        )}

        {/* Trivia — direita da barra de data */}
        {(dollarQuery.data || triviaQuery.data?.worldDay) && (
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            {triviaQuery.data?.worldDay && (
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                <span>Hoje é {triviaQuery.data.worldDay}</span>
              </span>
            )}
            {triviaQuery.data?.worldDay && dollarQuery.data && (
              <span className="text-border">·</span>
            )}
            {dollarQuery.data && (
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                <span>Dólar hoje <strong className="text-foreground">R$ {dollarQuery.data}</strong></span>
              </span>
            )}
          </div>
        )}
      </div>}

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {newsQuery.isLoading ? (
          <div className="space-y-4 max-w-3xl mx-auto">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <Newspaper className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">
              {favoritesOnly
                ? "Nenhuma notícia favoritada"
                : "Nenhuma notícia disponível para este dia e setor"}
            </p>
          </div>
        ) : hasSplitSlots ? (
          <div className="space-y-8 max-w-3xl mx-auto">
            {morningArticles.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Edição da manhã — 08:30
                </h2>
                <div className="space-y-4">
                  {morningArticles.map((a) => (
                    <ArticleCard key={a.id} article={a} onShare={setShareArticle} />
                  ))}
                </div>
              </section>
            )}
            {afternoonArticles.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Edição da tarde — 13:30
                </h2>
                <div className="space-y-4">
                  {afternoonArticles.map((a) => (
                    <ArticleCard key={a.id} article={a} onShare={setShareArticle} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} onShare={setShareArticle} />
            ))}
          </div>
        )}
      </div>

      {shareArticle && (
        <ShareDialog article={shareArticle} onClose={() => setShareArticle(null)} />
      )}
    </div>
  );
}
