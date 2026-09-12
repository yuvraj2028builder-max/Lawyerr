/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { authService, type AuthSession } from "@/services/auth.service";

const AuthContext = createContext<AuthSession>({ status: "unavailable", user: null, mode: "development" });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>({ status: "unavailable", user: null, mode: "development" });
  useEffect(() => { authService.getSession().then(setSession).catch(() => setSession({ status: "error", user: null, mode: "development", error: "Authentication status unavailable." })); }, []);
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
