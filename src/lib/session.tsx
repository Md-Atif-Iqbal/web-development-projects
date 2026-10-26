"use client";

// Session context — single source of truth for the signed-in user.
// Backed by TanStack Query against GET /api/auth/me.

import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import type { Me } from "@/lib/types";

const SessionContext = createContext<{
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
}>({ user: null, loading: true, refresh: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: Me | null }>("/api/auth/me"),
    staleTime: 60_000,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["me"] });
  };

  return (
    <SessionContext.Provider value={{ user: data?.user ?? null, loading: isLoading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
