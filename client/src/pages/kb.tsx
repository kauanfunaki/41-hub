import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageContainer } from "@/components/page-container";
import {
  BookOpen,
  Search,
  Eye,
  ThumbsUp,
  ChevronRight,
  Loader2,
  Settings2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import type { TicketCategory } from "@shared/schema";
import { cn } from "@/lib/utils";

interface KbArticleItem {
  id: string;
  title: string;
  body: string;
  categoryName?: string;
  authorName?: string;
  viewCount?: number;
  helpfulCount?: number;
  isPublished: boolean;
  updatedAt: string;
}

function readingTime(body: string): string {
  const words = body.split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min`;
}

function stripMarkdown(text: string, maxLen = 140): string {
  const lines = text.split("\n");
  const chunks: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // skip table rows and separators
    if (/^\|/.test(t) || /^[\|\s\-:=+]+$/.test(t)) continue;
    // skip headings, code fences, horizontal rules, blockquote markers alone
    if (/^#{1,6}\s/.test(t) || /^```/.test(t) || /^[-*_]{3,}$/.test(t)) continue;

    const clean = t
      .replace(/`[^`]*`/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, "$1")
      .replace(/_{1,3}([^_\n]*)_{1,3}/g, "$1")
      .replace(/^>\s*/, "")
      .trim();

    if (clean) chunks.push(clean);
    if (chunks.join(" ").length >= maxLen) break;
  }

  const result = chunks.join(" ").slice(0, maxLen);
  return result || text.replace(/\s+/g, " ").slice(0, maxLen);
}

export default function Kb() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const { data: articles = [], isLoading } = useQuery<KbArticleItem[]>({
    queryKey: ["/api/kb", filterCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCategory && filterCategory !== "all") params.set("categoryId", filterCategory);
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/kb?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: categories = [] } = useQuery<TicketCategory[]>({
    queryKey: ["/api/admin/tickets/categories"],
  });

  // Show all categories (both parent and leaf) so the filter is more useful
  const allCategories = categories;

  const mostRead = [...articles].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)).slice(0, 3);
  // Exclude the top-3 most-read from "Todos os artigos" to prevent duplication
  const mostReadIds = new Set(mostRead.map(m => m.id));
  const remaining = searchQuery || filterCategory !== "all"
    ? articles
    : articles.filter(a => !mostReadIds.has(a.id));

  return (
    <PageContainer className="flex flex-col gap-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10">
            <BookOpen className="h-5 w-5 text-chart-1" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Base de Conhecimento</h1>
            <p className="text-sm text-muted-foreground">Artigos e guias para suporte</p>
          </div>
        </div>
        {user?.isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/admin/kb")}
          >
            <Settings2 className="h-4 w-4 mr-2" />
            Gerenciar artigos
          </Button>
        )}
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3 flex-wrap" data-tutorial="kb-search">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar artigos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {allCategories.length > 0 && (
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.parentId ? `↳ ${c.name}` : c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-4 flex gap-4">
              <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <BookOpen className="h-8 w-8 opacity-40" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">Nenhum artigo encontrado</p>
            <p className="text-sm mt-1">
              {searchQuery ? "Tente uma busca diferente." : "Nenhum artigo publicado ainda."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Mais lidos — só quando não está buscando/filtrando */}
          {!searchQuery && filterCategory === "all" && mostRead.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Eye className="h-3.5 w-3.5" />
                Mais lidos
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mostRead.map((article) => (
                  <button
                    key={article.id}
                    className="text-left rounded-xl border bg-card hover:bg-accent transition-colors overflow-hidden group p-4 flex flex-col gap-2"
                    onClick={() => setLocation(`/kb/articles/${article.id}`)}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-1/10">
                      <BookOpen className="h-4 w-4 text-chart-1" />
                    </div>
                    <p className="font-semibold text-sm leading-snug line-clamp-2">{article.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed flex-1">
                      {stripMarkdown(article.body)}{article.body.length > 140 ? "…" : ""}
                    </p>
                    <div className="flex items-center gap-3 mt-auto pt-1">
                      {article.categoryName && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-chart-1/10 text-chart-1 border border-chart-1/20">
                          {article.categoryName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                        <Eye className="h-3 w-3" />{article.viewCount ?? 0}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Todos os artigos */}
          {remaining.length > 0 && (
            <>
              {(!searchQuery && filterCategory === "all" && mostRead.length > 0) && (
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  Todos os artigos
                </p>
              )}
          <div className="space-y-2">
            {remaining.map((article) => (
              <button
                key={article.id}
                className="w-full text-left rounded-xl border bg-card hover:bg-accent transition-colors overflow-hidden group"
                onClick={() => setLocation(`/kb/articles/${article.id}`)}
              >
                <div className="flex items-start gap-4 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chart-1/10 mt-0.5">
                    <BookOpen className="h-4 w-4 text-chart-1" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-snug">{article.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {stripMarkdown(article.body)}{article.body.length > 140 ? "…" : ""}
                    </p>
                    <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                      {article.categoryName && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-chart-1/10 text-chart-1 border border-chart-1/20">
                          {article.categoryName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{readingTime(article.body)} de leitura</span>
                      {article.viewCount !== undefined && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="h-3 w-3" />{article.viewCount}
                        </span>
                      )}
                      {article.helpfulCount !== undefined && article.helpfulCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ThumbsUp className="h-3 w-3" />{article.helpfulCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
            </>
          )}
        </div>
      )}
    </PageContainer>
  );
}
