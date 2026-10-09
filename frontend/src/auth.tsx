import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, loadToken, saveToken, setUnauthorizedHandler, type Me } from "@/src/api";
import { setColorScheme } from "@/src/theme";
import i18n, { setLanguage } from "@/src/i18n";

type Ctx = {
  user: Me | null; ready: boolean;
  signIn: (token: string, user: Me) => Promise<void>;
  signOut: () => Promise<void>;
  updateMe: (patch: Record<string, unknown>) => Promise<Me>;
  setUser: (u: Me) => void;
};
const AuthContext = createContext<Ctx>(null as any);

const applyPrefs = (u: Me) => setColorScheme(u.theme === "light" || u.theme === "dark" ? u.theme : null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const signOut = useCallback(async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    await saveToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { saveToken(null); setUser(null); });
    (async () => {
      if (await loadToken()) {
        try {
          const { user: u } = await api<{ user: Me }>("/auth/me");
          setUser(u); applyPrefs(u);
        } catch (e: any) {
          if (e.status === 401) await saveToken(null);
        }
      }
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (token: string, u: Me) => {
    await saveToken(token);
    // Sync language: device choice wins on first login, then server keeps it across devices.
    if (u.language !== i18n.language) {
      const r = await api<{ user: Me }>("/users/me", { method: "PATCH", body: { language: i18n.language } }).catch(() => null);
      if (r) u = r.user;
    }
    applyPrefs(u);
    setUser(u);
  }, []);

  const updateMe = useCallback(async (patch: Record<string, unknown>) => {
    const { user: u } = await api<{ user: Me }>("/users/me", { method: "PATCH", body: patch });
    if (patch.language) await setLanguage(String(patch.language));
    applyPrefs(u);
    setUser(u);
    return u;
  }, []);

  return <AuthContext.Provider value={{ user, ready, signIn, signOut, updateMe, setUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
