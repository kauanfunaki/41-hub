import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BarChart3 } from "lucide-react";
import { SearchInput } from "@/components/search-input";
import { ResourceGrid } from "@/components/resource-grid";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { ResourceWithHealth } from "@shared/schema";

export default function Dashboards() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: resources = [], isLoading } = useQuery<ResourceWithHealth[]>({
    queryKey: ["/api/resources"],
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ resourceId, isFavorite }: { resourceId: string; isFavorite: boolean }) => {
      if (isFavorite) {
        return apiRequest("POST", `/api/favorites/${resourceId}`);
      } else {
        return apiRequest("DELETE", `/api/favorites/${resourceId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    },
  });

  const filteredResources = useMemo(() => {
    const dashboards = resources.filter((r) => r.type === "DASHBOARD");
    if (!searchQuery.trim()) return dashboards;
    const query = searchQuery.toLowerCase();
    return dashboards.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.tags?.some((t) => t.toLowerCase().includes(query)) ||
        r.sectorName?.toLowerCase().includes(query)
    );
  }, [resources, searchQuery]);

  const handleOpenResource = (resource: ResourceWithHealth) => {
    setLocation(`/resource/${resource.id}`);
  };

  const handleToggleFavorite = (resourceId: string, isFavorite: boolean) => {
    toggleFavoriteMutation.mutate({ resourceId, isFavorite });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/10">
          <BarChart3 className="h-5 w-5 text-chart-2" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboards</h1>
          <p className="text-sm text-muted-foreground">
            Relatórios e análises Power BI
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border-b">
          <p className="text-sm font-medium text-muted-foreground">
            {isLoading ? "Carregando dashboards…" : `${filteredResources.length} ${filteredResources.length !== 1 ? "dashboards disponíveis" : "dashboard disponível"}`}
          </p>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Buscar dashboards..."
            className="sm:w-64"
          />
        </div>
        <div className="p-4" data-tutorial="dashboards-grid">
          <ResourceGrid
            resources={filteredResources}
            isLoading={isLoading}
            onOpen={handleOpenResource}
            onToggleFavorite={handleToggleFavorite}
            isAdmin={user?.isAdmin === true}
            showSector
            emptyMessage={
              searchQuery
                ? "Nenhum dashboard encontrado para sua busca"
                : "Nenhum dashboard disponível"
            }
          />
        </div>
      </div>
    </div>
  );
}
