import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Router } from "@/app/router";
import { LanguageProvider } from "@/context/LanguageContext";
import { CaseProvider } from "@/context/CaseContext";
import { AuthProvider } from "@/context/AuthContext";
import { LOCAL_DEMO_MESSAGE } from "@/backend/authProvider";
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
          <div role="status" aria-live="polite" className="tiny" style={{ background: "#fff7ed", borderBottom: "1px solid #fed7aa", color: "#9a3412", textAlign: "center", padding: "6px 12px", fontWeight: 600 }}>
            {LOCAL_DEMO_MESSAGE}
          </div>
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
