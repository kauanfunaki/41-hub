import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";

export type TutorialRole = "Coordenador" | "Usuario";

export function useTutorial() {
  const { user, refreshUser } = useAuth();

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/users/me", { tutorialCompleted: true }),
    onSuccess: () => refreshUser(),
  });

  const primaryRole: TutorialRole =
    !user?.isAdmin && user?.roles?.some((r) => r.roleName === "Coordenador")
      ? "Coordenador"
      : "Usuario";

  // Admins skip tutorial; show only when field is false
  const shouldShow =
    !!user && !user.isAdmin && !user.tutorialCompleted;

  return {
    shouldShow,
    role: primaryRole,
    complete: () => mutation.mutate(),
    isCompleting: mutation.isPending,
  };
}
