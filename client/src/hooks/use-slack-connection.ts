import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";

export interface SlackConnection {
  configured: boolean;
  connected: boolean;
  reminderDismissed: boolean;
  sessionDismissed: boolean;
  wrongWorkspace: boolean;
  teamId: string | null;
}

export const slackConnectionKey = (userId?: string) => ["/api/users/me/slack", userId] as const;

export function useSlackConnection() {
  const { user } = useAuth();
  return useQuery<SlackConnection>({
    queryKey: slackConnectionKey(user?.id),
    queryFn: async () => (await apiRequest("GET", "/api/users/me/slack")).json(),
    enabled: !!user,
    refetchOnMount: "always",
  });
}
