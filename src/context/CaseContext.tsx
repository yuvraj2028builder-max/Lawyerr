/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback } from "react";
import type { Case, CaseMessage, ID } from "@/types/domain";
import { caseEngine } from "@/services/caseEngine.service";

type Ctx = {
  currentCase: Case | null;
  messages: CaseMessage[];
  createCase: (description: string, title?: string) => Promise<Case>;
  setCurrentCase: (c: Case | null) => void;
  addMessage: (caseId: ID, content: string, role?: CaseMessage["role"]) => Promise<CaseMessage>;
  refreshCase: (id: ID) => Promise<void>;
};

const CaseContext = createContext<Ctx | null>(null);

export function CaseProvider({ children }: { children: React.ReactNode }) {
  const [currentCase, setCurrentCase] = useState<Case | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);

  const createCase = useCallback(async (description: string, title?: string) => {
    const c = await caseEngine.createCase({ description, title });
    setCurrentCase(c);
    setMessages([]);
    return c;
  }, []);

  const addMessage = useCallback(async (caseId: ID, content: string, role: CaseMessage["role"] = "user") => {
    const msg = await caseEngine.addMessage(caseId, { role, content });
    setMessages((prev) => [...prev, msg]);
    // refresh case updatedAt
    const updated = await caseEngine.getCase(caseId);
    if (updated) setCurrentCase(updated);
    return msg;
  }, []);

  const refreshCase = useCallback(async (id: ID) => {
    const c = await caseEngine.getCase(id);
    if (c) setCurrentCase(c);
  }, []);

  return (
    <CaseContext.Provider value={{ currentCase, messages, createCase, setCurrentCase, addMessage, refreshCase }}>
      {children}
    </CaseContext.Provider>
  );
}

export function useCase() {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error("useCase must be within CaseProvider");
  return ctx;
}
