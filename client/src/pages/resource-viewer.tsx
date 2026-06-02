import { useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, ExternalLink, Star, AlertCircle, Monitor, Layout, AlertTriangle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-provider";
import { useAuth } from "@/lib/auth-context";
import type { ResourceWithHealth } from "@shared/schema";
import { effectiveHealth } from "@shared/schema";

type OpenBehavior = "HUB_ONLY" | "NEW_TAB_ONLY" | "BOTH";

const getStatusColor = (status?: "UP" | "DEGRADED" | "DOWN") => {
  switch (status) {
    case "UP":
      return "bg-status-online";
    case "DEGRADED":
      return "bg-status-away";
    case "DOWN":
      return "bg-status-busy";
    default:
      return "bg-status-offline";
  }
};

const getStatusText = (status?: "UP" | "DEGRADED" | "DOWN") => {
  switch (status) {
    case "UP":
      return "Online";
    case "DEGRADED":
      return "Degradado";
    case "DOWN":
      return "Offline";
    default:
      return "Desconhecido";
  }
};

function appendHubTheme(url: string, theme: string): string {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("hubTheme", theme);
    return u.toString();
  } catch {
    return url;
  }
}

export default function ResourceViewer() {
  const [, params] = useRoute("/resource/:id");
  const [, setLocation] = useLocation();
  const resourceId = params?.id;
  const { theme } = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const { data: resource, isLoading, error } = useQuery<ResourceWithHealth>({
    queryKey: ["/api/resources", resourceId],
    enabled: !!resourceId,
  });

  const recordAccessMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/resources/${resourceId}/access`);
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (isFavorite: boolean) => {
      if (isFavorite) {
        return apiRequest("POST", `/api/favorites/${resourceId}`);
      } else {
        return apiRequest("DELETE", `/api/favorites/${resourceId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", resourceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    },
  });

  const openBehavior = (resource?.openBehavior as OpenBehavior) || "BOTH";
  const hasOpenedInNewTab = useRef<string | null>(null);

  useEffect(() => {
    if (resource) {
      recordAccessMutation.mutate();
      
      if (openBehavior === "NEW_TAB_ONLY" && resource.url && hasOpenedInNewTab.current !== resource.id) {
        hasOpenedInNewTab.current = resource.id;
        window.open(appendHubTheme(resource.url, theme), "_blank");
      }
    }
  }, [resource?.id, openBehavior]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "hub-theme-change", theme }, "*");
    }
  }, [theme]);

  const openInNewTab = useCallback((url: string) => {
    window.open(appendHubTheme(url, theme), "_blank");
  }, [theme]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-4 p-4 border-b">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="rounded-xl border bg-card max-w-md w-full">
          <EmptyState
            icon={AlertCircle}
            title="Recurso não encontrado"
            description="O recurso solicitado não existe ou você não tem permissão para acessá-lo."
            action={<Button onClick={() => setLocation("/")} data-testid="button-go-home">Voltar para o início</Button>}
          />
        </div>
      </div>
    );
  }

  const renderNewTabOnlyMessage = () => (
    <div className="flex items-center justify-center h-full p-6">
      <div className="rounded-xl border bg-card max-w-lg w-full">
        <EmptyState
          icon={ExternalLink}
          title={resource.name}
          description="Este recurso foi aberto em uma nova aba"
          action={
            <Button variant="outline" onClick={() => openInNewTab(resource.url!)} data-testid="button-open-external">
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir novamente
            </Button>
          }
        />
      </div>
    </div>
  );

  const renderContent = () => {
    const health = effectiveHealth(resource);
    const hasIssue = health === "DOWN" || health === "DEGRADED";

    if (hasIssue && !isAdmin) {
      const isDown = health === "DOWN";
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="rounded-xl border bg-card max-w-md w-full">
            <EmptyState
              icon={isDown ? AlertTriangle : Wrench}
              title={isDown ? "Recurso fora do ar" : "Recurso em manutenção"}
              description={
                resource.healthMessage
                  ? resource.healthMessage
                  : isDown
                  ? "Este recurso está temporariamente fora do ar. Tente novamente mais tarde."
                  : "Este recurso está em manutenção no momento."
              }
              action={<Button variant="outline" onClick={() => setLocation("/alerts")}>Ver alertas</Button>}
            />
          </div>
        </div>
      );
    }

    // NEW_TAB_ONLY: Show confirmation message for all embed modes
    if (openBehavior === "NEW_TAB_ONLY") {
      if (resource.url) {
        return renderNewTabOnlyMessage();
      }
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="rounded-xl border bg-card max-w-md w-full">
            <EmptyState
              icon={AlertCircle}
              title="Recurso não configurado"
              description="Este recurso está configurado para abrir em nova aba, mas a URL não foi definida."
            />
          </div>
        </div>
      );
    }

    if (resource.embedMode === "IFRAME" && resource.url) {
      return (
        <iframe
          ref={iframeRef}
          src={`/api/proxy/${resource.id}`}
          className="w-full h-full border-0"
          title={resource.name}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      );
    }

    if (resource.embedMode === "POWERBI") {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="rounded-xl border bg-card max-w-lg w-full">
            <EmptyState
              icon={Layout}
              title={resource.name}
              description="A integração completa do Power BI será configurada quando as credenciais estiverem disponíveis."
              action={
                resource.url && openBehavior !== "HUB_ONLY" ? (
                  <Button variant="outline" onClick={() => openInNewTab(resource.url!)} data-testid="button-open-powerbi">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir no Power BI
                  </Button>
                ) : undefined
              }
            />
          </div>
        </div>
      );
    }

    if (resource.embedMode === "LINK" && resource.url) {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="rounded-xl border bg-card max-w-lg w-full">
            <EmptyState
              icon={resource.type === "APP" ? Monitor : Layout}
              title={resource.name}
              description={resource.sectorName ?? undefined}
              action={
                openBehavior !== "HUB_ONLY" ? (
                  <Button onClick={() => openInNewTab(resource.url!)} data-testid="button-open-external">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir em nova aba
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Este recurso pode ser acessado apenas através do Hub
                  </p>
                )
              }
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="rounded-xl border bg-card max-w-md w-full">
          <EmptyState
            icon={AlertCircle}
            title="Recurso não configurado"
            description="Este recurso ainda não foi configurado corretamente."
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-medium truncate">{resource.name}</h1>
            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  getStatusColor(effectiveHealth(resource))
                )}
              />
              <span className="text-xs text-muted-foreground">
                {getStatusText(effectiveHealth(resource))}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {resource.tags && resource.tags.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              {resource.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleFavoriteMutation.mutate(!resource.isFavorite)}
            data-testid="button-toggle-favorite"
          >
            <Star
              className={cn(
                "h-4 w-4",
                resource.isFavorite
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground"
              )}
            />
          </Button>
          {resource.url && resource.embedMode !== "LINK" && openBehavior !== "HUB_ONLY" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openInNewTab(resource.url!)}
              data-testid="button-open-new-tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden bg-background">
        {renderContent()}
      </div>
    </div>
  );
}
