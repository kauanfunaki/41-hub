import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Notification } from "@shared/schema";

/**
 * NotificationBell
 *
 * Responsible only for UI: unread badge, dropdown list, mark-as-read actions.
 * The polling + toast + sound side-effects live in NotificationProvider.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 15_000,
  });

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const dropdown = document.getElementById("notification-dropdown");
      if (dropdown && !dropdown.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = countData?.count ?? 0;

  // ── Bell ring on new notification ────────────────────────────────────────
  const bellIconRef = useRef<SVGSVGElement>(null);
  // undefined = first render (query not resolved yet); never animate on mount
  const prevCountRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (prevCountRef.current !== undefined && unreadCount > prevCountRef.current) {
      const svg = bellIconRef.current;
      if (!svg) return;

      // Remove class first to allow re-triggering if already ringing
      svg.classList.remove("ringing");
      void svg.offsetWidth; // force reflow so animation restarts
      svg.classList.add("ringing");

      const cleanup = () => svg.classList.remove("ringing");
      svg.addEventListener("animationend", cleanup, { once: true });
      prevCountRef.current = unreadCount;
      return () => svg.removeEventListener("animationend", cleanup);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  function handleNotificationClick(notif: Notification) {
    if (!notif.isRead) markReadMutation.mutate(notif.id);
    if (notif.linkUrl) {
      navigate(notif.linkUrl);
      setOpen(false);
    }
  }

  function formatTime(dateStr: string) {
    // Compara sempre em UTC para o diff relativo estar correto
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    // Para datas antigas, exibe horário de Brasília
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(dateStr));
  }

  return (
    <div className="relative" id="notification-dropdown">
      <div className="relative inline-flex">
        {/* Bell button — design: spotty-rabbit-35 / motion: tricky-bullfrog-41 */}
        <Button
          variant="ghost"
          size="icon"
          className="notif-bell-btn rounded-lg"
          onClick={() => setOpen((v) => !v)}
          data-testid="button-notification-bell"
        >
          {/* SVG from Uiverse spotty-rabbit-35 (mrhyddenn, MIT) */}
          <svg
            ref={bellIconRef}
            className="notif-bell-icon h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fill="none" d="M0 0h24v24H0z" />
            <path d="M20 17h2v2H2v-2h2v-7a8 8 0 1 1 16 0v7zm-2 0v-7a6 6 0 1 0-12 0v7h12zm-9 4h6v2H9v-2z" />
          </svg>
        </Button>
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 text-xs flex items-center justify-center pointer-events-none"
            data-testid="badge-notification-count"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </div>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50"
          data-testid="dropdown-notifications"
        >
          <div className="flex items-center justify-between p-3 border-b">
            <span className="font-semibold text-sm">Notificações</span>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Marcar todas como lidas
              </Button>
            )}
          </div>

          <ScrollArea className="max-h-80">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Carregando...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhuma notificação
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notif) => (
                  <button
                    key={notif.id}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors flex gap-3 items-start ${
                      !notif.isRead ? "bg-primary/5" : ""
                    }`}
                    onClick={() => handleNotificationClick(notif)}
                    data-testid={`notification-item-${notif.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-tight ${
                          !notif.isRead ? "font-semibold" : ""
                        }`}
                      >
                        {notif.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTime(notif.createdAt as unknown as string)}
                      </p>
                    </div>
                    {!notif.isRead && (
                      <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}