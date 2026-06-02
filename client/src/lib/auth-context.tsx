import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import type { UserWithRoles } from "@shared/schema";

interface AuthContextType {
  user: UserWithRoles | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserWithRoles | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const fetchUser = useCallback(async (minDisplayMs = 0) => {
    const start = Date.now();
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        // Garantir tempo mínimo de exibição do loading (usado no fluxo Entra)
        if (minDisplayMs > 0) {
          const remaining = minDisplayMs - (Date.now() - start);
          if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Se o usuário acabou de fazer login via Entra, aplica tempo mínimo de loading
    const loginPending = sessionStorage.getItem("loginPending") === "1";
    if (loginPending) {
      sessionStorage.removeItem("loginPending");
      fetchUser(3000);
    } else {
      fetchUser();
    }
  }, [fetchUser]);

  const login = () => {
    // Sinaliza que um login via Entra está em andamento para exibir o loading ao voltar
    sessionStorage.setItem("loginPending", "1");
    window.location.href = "/api/auth/login";
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      // Apenas limpa o estado local — sem reload de página para não disparar
      // o isLoading=true que causaria o flash da tela de loading
      setUser(null);
    } catch (error) {
      console.error("Failed to logout:", error);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    // flushSync garante que o React pinta o loading ANTES de continuar,
    // evitando o "flash" causado por fetchUser() resolver rápido em localhost
    flushSync(() => setIsAuthenticating(true));
    await Promise.all([
      fetchUser(),
      new Promise(r => setTimeout(r, 3000)),
    ]);
    setIsAuthenticating(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticating,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
