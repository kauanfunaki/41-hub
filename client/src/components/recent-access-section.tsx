import { Clock, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionDivider } from "@/components/section-divider";
import type { ResourceWithHealth } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface RecentAccessSectionProps {
  resources: ResourceWithHealth[];
  isLoading: boolean;
  onOpen: (resource: ResourceWithHealth) => void;
}

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

export function RecentAccessSection({
  resources,
  isLoading,
  onOpen,
}: RecentAccessSectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <SectionDivider icon={Clock} label="Acessados Recentemente" />
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-40 shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (resources.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionDivider icon={Clock} label="Acessados Recentemente" />
        <Link href="/apps">
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 shrink-0 ml-3">
            Ver todos <ArrowRight className="h-3 w-3" />
          </button>
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {resources.map((resource) => (
          <button
            key={resource.id}
            onClick={() => onOpen(resource)}
            className="flex items-center gap-3 shrink-0 rounded-lg border bg-card p-3 hover:bg-accent transition-colors min-w-[160px]"
            data-testid={`recent-${resource.id}`}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-md shrink-0",
                resource.type === "APP"
                  ? "bg-primary/10 text-primary"
                  : "bg-chart-2/10 text-chart-2",
              )}
            >
              {resource.type === "APP" ? (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              )}
            </div>
            <div className="flex flex-col items-start text-left overflow-hidden">
              <span className="text-sm font-medium truncate max-w-[100px]">
                {resource.name}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    getStatusColor(resource.healthStatus),
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {resource.type === "APP" ? "App" : "Dashboard"}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
