import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { PageContainer } from "@/components/page-container";
import {
  ArrowLeft,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  Eye,
  Calendar,
  User,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownContent } from "@/components/markdown-content";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";

interface KbArticleFull {
  id: string;
  title: string;
  body: string;
  categoryName?: string;
  authorName?: string;
  viewCount?: number;
  helpfulCount?: number;
  notHelpfulCount?: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function KbArticle() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [feedbackGiven, setFeedbackGiven] = useState<boolean | null>(null);

  const { data: article, isLoading, isError } = useQuery<KbArticleFull>({
    queryKey: [`/api/kb/${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/kb/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Artigo não encontrado");
      return res.json();
    },
    retry: false,
  });

  const feedbackMutation = useMutation({
    mutationFn: (helpful: boolean) =>
      apiRequest("POST", `/api/kb/${id}/feedback`, { helpful }),
    onSuccess: (_, helpful) => {
      setFeedbackGiven(helpful);
      toast({
        title: helpful ? "Obrigado pelo feedback!" : "Feedback registrado",
        description: helpful ? "Fico feliz que o artigo ajudou." : "Vamos trabalhar para melhorar.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/kb/${id}`] });
    },
    onError: () =>
      toast({ title: "Não foi possível registrar o feedback", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <PageContainer className="flex flex-col gap-6 py-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? "w-3/4" : "w-full"}`} />
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (isError || !article) {
    return (
      <PageContainer className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <BookOpen className="h-8 w-8 opacity-40" />
        </div>
        <div className="text-center">
          <p className="font-medium text-foreground text-lg">Artigo não encontrado</p>
          <p className="text-sm mt-1">O artigo que você procura não existe ou foi removido.</p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/kb")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar à base de conhecimento
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="flex flex-col gap-4 py-6 max-w-3xl">
      {/* Breadcrumb nav */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/kb")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Base de Conhecimento
        </Button>
        {user?.isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/admin/kb")}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Editar
          </Button>
        )}
      </div>

      {/* Article */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Category accent stripe */}
        <div className="h-[3px] bg-chart-1" />

        {/* Header */}
        <div className="p-6 border-b space-y-3">
          {article.categoryName && (
            <span className="inline-flex text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-chart-1/10 text-chart-1 border border-chart-1/20">
              {article.categoryName}
            </span>
          )}

          <div className="flex items-start gap-3">
            <h1 className="text-xl font-bold leading-snug flex-1">
              {article.title}
            </h1>
            {!article.isPublished && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground shrink-0 mt-1">
                Rascunho
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {article.authorName && (
              <span className="flex items-center gap-1.5">
                <User className="h-3 w-3" />
                {article.authorName}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Atualizado em{" "}
              {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
                new Date(article.updatedAt)
              )}
            </span>
            {article.viewCount !== undefined && (
              <span className="flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                {article.viewCount} {article.viewCount === 1 ? "visualização" : "visualizações"}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <MarkdownContent content={article.body} />
        </div>

        {/* Feedback */}
        <div className="border-t p-6">
          {feedbackGiven !== null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              {feedbackGiven
                ? "Obrigado! Fico feliz que o artigo foi útil."
                : "Obrigado pelo feedback. Vamos melhorar."}
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <p className="text-sm font-medium">Este artigo foi útil?</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => feedbackMutation.mutate(true)}
                  disabled={feedbackMutation.isPending}
                  className="gap-2"
                >
                  <ThumbsUp className="h-4 w-4" />
                  Sim
                  {article.helpfulCount ? (
                    <span className="text-muted-foreground">({article.helpfulCount})</span>
                  ) : null}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => feedbackMutation.mutate(false)}
                  disabled={feedbackMutation.isPending}
                  className="gap-2"
                >
                  <ThumbsDown className="h-4 w-4" />
                  Não
                  {article.notHelpfulCount ? (
                    <span className="text-muted-foreground">({article.notHelpfulCount})</span>
                  ) : null}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
