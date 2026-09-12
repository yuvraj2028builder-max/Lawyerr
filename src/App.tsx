import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Router } from "@/app/router";
import { LanguageProvider } from "@/context/LanguageContext";
import { CaseProvider } from "@/context/CaseContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LOCAL_DEMO_MESSAGE } from "@/backend/authProvider";
import { ensureLegalCorpusInitialized } from "@/services/legal/init";

function ModeBanner() {
  const auth = useAuth();
  const signedIn = auth.status === "authenticated" && auth.user;
  return (
    <div role="status" aria-live="polite" className="tiny" style={{ background: signedIn ? "#ecfdf5" : "#fff7ed", borderBottom: `1px solid ${signedIn ? "#a7f3d0" : "#fed7aa"}`, color: signedIn ? "#065f46" : "#9a3412", textAlign: "center", padding: "6px 12px", fontWeight: 600 }}>
      {signedIn
        ? `Signed in via Supabase${auth.user?.displayName ? ` as ${auth.user.displayName}` : ""} — demo cases on this device stay in this browser.`
        : LOCAL_DEMO_MESSAGE}
    </div>
  );
}

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
          <ModeBanner />
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
