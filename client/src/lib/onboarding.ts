import type { UserWithRoles } from "@shared/schema";

type OnboardingUser = Pick<UserWithRoles, "authProvider" | "mustChangePassword" | "isAdmin" | "tutorialCompleted">;

/** One phase at a time: local password first, then tutorial, then optional Slack. */
export function getOnboardingStep(user: OnboardingUser | null): "none" | "password" | "tutorial" | "slack" {
  if (!user) return "none";
  if (user.authProvider === "local" && user.mustChangePassword) return "password";
  if (!user.isAdmin && !user.tutorialCompleted) return "tutorial";
  return "slack";
}
