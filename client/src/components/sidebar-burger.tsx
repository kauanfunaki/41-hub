import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Animated hamburger ↔ X sidebar toggle — adapted from Uiverse
 * "good-wolverine-51" (MIT). Wired to the shadcn sidebar: the bars morph
 * into an X when the sidebar is expanded/open.
 */
export function SidebarBurger({ className }: { className?: string }) {
  const { openMobile, isMobile, toggleSidebar } = useSidebar();

  // The sidebar no longer collapses on desktop — the toggle is kept only on
  // mobile, where it is the way to open/close the navigation drawer.
  if (!isMobile) return null;

  const open = openMobile;

  return (
    <label
      className={cn("sidebar-burger", className)}
      aria-label="Alternar menu lateral"
      data-testid="button-sidebar-toggle"
    >
      <input
        type="checkbox"
        checked={open}
        onChange={toggleSidebar}
        tabIndex={0}
      />
      <span></span>
      <span></span>
      <span></span>
    </label>
  );
}
