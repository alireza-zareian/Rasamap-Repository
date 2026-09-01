"use client";
import { useState, useEffect } from "react";

export interface CurrentUser { id: number; name: string; phone: string; }

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  };

  return { user, loading: user === undefined, logout };
}
