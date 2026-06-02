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

function stripMarkdown(text: string): string {
  return text.replace(/[#*`_\[\]]/g, "").slice(0, 140);
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
    enabled: user?.isAdmin === true,
  });

  const leafCategories = categories.filter((c) => c.parentId !== null);

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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar artigos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {user?.isAdmin && leafCategories.length > 0 && (
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filtrar por categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {leafCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
        <div className="space-y-2">
          {articles.map((article) => (
            <button
              key={article.id}
              className="w-full text-left rounded-xl border bg-card hover:bg-accent transition-colors overflow-hidden group"
              onClick={() => setLocation(`/kb/articles/${article.id}`)}
            >
              <div className="flex items-start gap-4 p-4">
                {/* Icon */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chart-1/10 mt-0.5">
                  <BookOpen className="h-4 w-4 text-chart-1" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-snug">{article.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {stripMarkdown(article.body)}
                    {article.body.length > 140 ? "…" : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                    {article.categoryName && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-chart-1/10 text-chart-1 border border-chart-1/20">
                        {article.categoryName}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {readingTime(article.body)} de leitura
                    </span>
                    {article.viewCount !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        {article.viewCount}
                      </span>
                    )}
                    {article.helpfulCount !== undefined && article.helpfulCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ThumbsUp className="h-3 w-3" />
                        {article.helpfulCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
