import { useState } from "react";
import { ExternalLink, AlertTriangle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FavoriteStar } from "@/components/ui/favorite-star";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ResourceWithHealth } from "@shared/schema";
import { effectiveHealth } from "@shared/schema";
import * as LucideIcons from "lucide-react";

interface ResourceCardProps {
  resource: ResourceWithHealth;
  onOpen: (resource: ResourceWithHealth) => void;
  onToggleFavorite: (resourceId: string, isFavorite: boolean) => void;
  showSector?: boolean;
  isAdmin?: boolean;
}

const getIcon = (iconName: string) => {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const Icon = icons[iconName] || LucideIcons.Layout;
  return Icon;
};

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

const getStatusLabel = (status?: "UP" | "DEGRADED" | "DOWN") => {
  switch (status) {
    case "UP":
      return "Operacional";
    case "DEGRADED":
      return "Em manutenção";
    case "DOWN":
      return "Fora do ar";
    default:
      return "Desconhecido";
  }
};

export function ResourceCard({
  resource,
  onOpen,
  onToggleFavorite,
  showSector = true,
  isAdmin = false,
}: ResourceCardProps) {
  const [showHealthModal, setShowHealthModal] = useState(false);
  const Icon = getIcon(resource.icon || "Layout");
  const isApp = resource.type === "APP";
  const displayHealth = effectiveHealth(resource);
  const hasIssue = displayHealth === "DOWN" || displayHealth === "DEGRADED";

  const handleClick = () => {
    if (hasIssue && !isAdmin) {
      setShowHealthModal(true);
      return;
    }
    onOpen(resource);
  };

  const statusDot = (
    <div
      className={cn(
        "h-2 w-2 rounded-full shrink-0",
        getStatusColor(displayHealth)
      )}
    />
  );

  return (
    <>
    <div
      className={cn(
        "rounded-xl border bg-card group relative cursor-pointer hover:bg-accent transition-colors",
        hasIssue && "border-amber-500/30"
      )}
      onClick={handleClick}
      data-testid={`card-resource-${resource.id}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
                isApp ? "bg-primary/10 text-primary" : "bg-chart-2/10 text-chart-2"
              )}
            >
              <Icon className="h-6 w-6" />
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-foreground truncate">
                  {resource.name}
                </h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {statusDot}
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[200px]">
                    <p className="font-medium">{getStatusLabel(displayHealth)}</p>
                    {resource.healthMessage && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {resource.healthMessage}
                      </p>
                    )}
                    {hasIssue && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ver alertas para mais detalhes.
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>

              {showSector && resource.sectorName && (
                <span className="text-xs text-muted-foreground truncate">
                  {resource.sectorName}
                </span>
              )}

              {hasIssue && (
                <span
                  className={cn(
                    "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border w-fit mt-0.5",
                    displayHealth === "DOWN"
                      ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                  )}
                >
                  {getStatusLabel(displayHealth)}
                </span>
              )}

              {resource.tags && resource.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {resource.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                  {resource.tags.length > 3 && (
                    <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                      +{resource.tags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <FavoriteStar
              checked={!!resource.isFavorite}
              onToggle={(next) => onToggleFavorite(resource.id, next)}
              title={
                resource.isFavorite
                  ? "Remover dos favoritos"
                  : "Adicionar aos favoritos"
              }
              className={cn(
                "h-8 w-8 items-center justify-center transition-opacity",
                resource.isFavorite
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100"
              )}
              data-testid={`button-favorite-${resource.id}`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              data-testid={`button-open-${resource.id}`}
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={showHealthModal} onOpenChange={setShowHealthModal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {displayHealth === "DOWN" ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <Wrench className="h-5 w-5 text-amber-500" />
            )}
            {displayHealth === "DOWN" ? "Recurso fora do ar" : "Recurso em manutenção"}
          </DialogTitle>
          <DialogDescription>
            {resource.healthMessage
              ? resource.healthMessage
              : displayHealth === "DOWN"
              ? "Este recurso está fora do ar no momento e não pode ser acessado."
              : "Este recurso está em manutenção no momento."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => setShowHealthModal(false)}
          >
            Fechar
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setShowHealthModal(false);
              window.location.href = "/alerts";
            }}
          >
            Ver alertas
          </Button>
          {isAdmin && (
            <Button
              variant="destructive"
              onClick={() => {
                setShowHealthModal(false);
                onOpen(resource);
              }}
            >
              Abrir mesmo assim
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
