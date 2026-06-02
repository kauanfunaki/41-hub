import { Layout } from "lucide-react";
import { ResourceCard } from "@/components/resource-card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResourceWithHealth } from "@shared/schema";

interface ResourceGridProps {
  resources: ResourceWithHealth[];
  isLoading: boolean;
  onOpen: (resource: ResourceWithHealth) => void;
  onToggleFavorite: (resourceId: string, isFavorite: boolean) => void;
  showSector?: boolean;
  emptyMessage?: string;
  isAdmin?: boolean;
}

export function ResourceGrid({
  resources,
  isLoading,
  onOpen,
  onToggleFavorite,
  showSector = true,
  emptyMessage = "Nenhum recurso encontrado",
  isAdmin = false,
}: ResourceGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <EmptyState
        icon={Layout}
        title={emptyMessage}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {resources.map((resource) => (
        <ResourceCard
          key={resource.id}
          resource={resource}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          showSector={showSector}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
}
