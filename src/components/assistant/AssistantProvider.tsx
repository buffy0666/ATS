"use client";

import { createContext, useContext, useMemo, useState } from "react";

type AssistantContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
};

const Ctx = createContext<AssistantContextValue | null>(null);

const STORAGE_KEY = "ats.assistant.activeConversation";

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  function setActiveConversationId(id: string | null) {
    setActiveConversationIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  const value = useMemo<AssistantContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((s) => !s),
      activeConversationId,
      setActiveConversationId,
    }),
    [open, activeConversationId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistant() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return v;
}
