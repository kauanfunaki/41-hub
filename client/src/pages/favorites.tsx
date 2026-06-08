import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";
import { ResourceGrid } from "@/components/resource-grid";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { ResourceWithHealth } from "@shared/schema";

export default function Favorites() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: favorites = [], isLoading } = useQuery<ResourceWithHealth[]>({
    queryKey: ["/api/favorites"],
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

  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favorites;
    const query = searchQuery.toLowerCase();
    return favorites.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.tags?.some((t) => t.toLowerCase().includes(query)) ||
        r.sectorName?.toLowerCase().includes(query)
    );
  }, [favorites, searchQuery]);

  const handleOpenResource = (resource: ResourceWithHealth) => {
    setLocation(`/resource/${resource.id}`);
  };

  const handleToggleFavorite = (resourceId: string, isFavorite: boolean) => {
    toggleFavoriteMutation.mutate({ resourceId, isFavorite });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-400/10">
          <Star className="h-5 w-5 text-yellow-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Favoritos</h1>
          <p className="text-sm text-muted-foreground">
            Seus recursos marcados como favoritos
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-base font-medium">
              {isLoading ? "Carregando favoritos…" : `${filteredFavorites.length} favorito${filteredFavorites.length !== 1 ? "s" : ""}`}
            </CardTitle>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Buscar favoritos..."
              className="sm:w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          <ResourceGrid
            resources={filteredFavorites.map((r) => ({ ...r, isFavorite: true }))}
            isLoading={isLoading}
            onOpen={handleOpenResource}
            onToggleFavorite={handleToggleFavorite}
            isAdmin={user?.isAdmin === true}
            emptyMessage={
              searchQuery
                ? "Nenhum favorito encontrado para sua busca"
                : "Você ainda não tem favoritos. Marque recursos com a estrela para adicioná-los aqui."
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
