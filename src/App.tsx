import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Router } from "@/app/router";
import { LanguageProvider } from "@/context/LanguageContext";
import { CaseProvider } from "@/context/CaseContext";
import { AuthProvider } from "@/context/AuthContext";
import { ensureLegalCorpusInitialized } from "@/services/legal/init";

export default function App() {
  useEffect(() => {
    ensureLegalCorpusInitialized().catch((e) => console.warn("[NyayaSetu] corpus init failed", e));
  }, []);
  return (
    <LanguageProvider>
      <AuthProvider>
      <CaseProvider>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <Header onNavigateHome={() => window.location.reload()} />
          <main style={{ flex: 1 }}>
            <Router />
          </main>
          <Footer />
        </div>
      </CaseProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
