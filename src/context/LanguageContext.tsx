/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useMemo } from "react";
import type { Language } from "@/types/domain";
import { dictionaries, t as translate } from "@/i18n/dictionaries";

type Ctx = {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string, fallback?: string) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("nyayasetu_lang") as Language | null;
    if (saved && dictionaries[saved]) return saved;
    return "en";
  });

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang: (l) => {
        setLang(l);
        localStorage.setItem("nyayasetu_lang", l);
        document.documentElement.lang = l;
      },
      t: (key, fallback) => translate(lang, key, fallback),
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
