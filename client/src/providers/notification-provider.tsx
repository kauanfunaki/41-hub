import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { playNotify } from "@/lib/sound";
import { initPushNotifications } from "@/lib/push-notifications";
import type { Notification } from "@shared/schema";

/**
 * NotificationProvider
 *
 * Mounted once inside the authenticated layout. Polls /api/notifications every 15s,
 * detects new entries (id > lastSeenId), fires a toast for each one in order
 * (oldest → newest) and plays the notification sound once.
 *
 * Uses a Set for deduplication so that even if the same batch is returned on
 * two consecutive polls, no toast is repeated.
 */
export function NotificationProvider() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const lastSeenIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const shownIdsRef = useRef(new Set<string>());

  // Inicializa Web Push quando o usuário está autenticado
  useEffect(() => {
    if (!isAuthenticated) return;
    initPushNotifications();
  }, [isAuthenticated]);

  const { data: recent = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", "provider-poll"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=20", {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15_000,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!recent.length) return;

    const newestId = recent[0].id;

    // First load: just record the baseline, no toasts
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSeenIdRef.current = newestId;
      recent.forEach((n) => shownIdsRef.current.add(n.id));
      return;
    }

    const lastSeen = lastSeenIdRef.current;
    if (!lastSeen) {
      lastSeenIdRef.current = newestId;
      return;
    }

    if (newestId === lastSeen) return;

    const newOnes: Notification[] = [];
    for (const n of recent) {
      if (n.id === lastSeen) break;
      if (!shownIdsRef.current.has(n.id)) newOnes.push(n);
    }

    lastSeenIdRef.current = newestId;

    for (const notif of newOnes.reverse()) {
      shownIdsRef.current.add(notif.id);
      toast({ title: notif.title, description: notif.message });
    }

    if (newOnes.length > 0) {
      playNotify();
    }
  }, [recent, toast]);

  // Renders nothing – pure side-effect component
  return null;
}