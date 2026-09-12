import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { LOCAL_DEMO_MESSAGE } from "@/backend/authProvider";

export function Header({ onNavigateHome }: { onNavigateHome?: () => void }) {
  const { lang, setLang, t } = useLanguage();
  const auth = useAuth();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(251,250,248,0.9)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <button
          onClick={onNavigateHome}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "none",
            border: 0,
            cursor: "pointer",
            padding: 0,
          }}
          aria-label="Go to home"
        >
          <span
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--color-primary)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            N
          </span>
          <span style={{ textAlign: "left" }}>
            <span style={{ display: "block", fontWeight: 700, fontSize: 16, lineHeight: 1, color: "var(--color-primary)" }}>
              {t("brand.name")}
            </span>
            <span className="tiny muted" style={{ lineHeight: 1 }}>
              {lang === "hi" ? "न्याय का सेतु" : "Nyaya ka setu"}
            </span>
          </span>
        </button>

        <div className="row" style={{ gap: 12 }}>
          <span className="tiny" title={auth.status === "authenticated" ? "Signed in via Supabase — your private online account." : LOCAL_DEMO_MESSAGE} style={{ padding: "6px 10px", borderRadius: 999, background: auth.status === "authenticated" ? "#ecfdf5" : "#fff7ed", color: auth.status === "authenticated" ? "#065f46" : "#9a3412", border: `1px solid ${auth.status === "authenticated" ? "#a7f3d0" : "#fed7aa"}`, fontWeight: 700 }}>
            {auth.status === "authenticated" ? "Signed in via Supabase" : "Local demo mode"}
          </span>
          <div
            role="group"
            aria-label="Language"
            style={{
              display: "flex",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 999,
              padding: 3,
            }}
          >
            <button
              aria-pressed={lang === "en"}
              onClick={() => setLang("en")}
              className="tiny"
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: 0,
                fontWeight: 600,
                cursor: "pointer",
                background: lang === "en" ? "var(--color-primary)" : "transparent",
                color: lang === "en" ? "#fff" : "var(--color-text-muted)",
              }}
            >
              English
            </button>
            <button
              aria-pressed={lang === "hi"}
              onClick={() => setLang("hi")}
              className="tiny"
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: 0,
                fontWeight: 600,
                cursor: "pointer",
                background: lang === "hi" ? "var(--color-primary)" : "transparent",
                color: lang === "hi" ? "#fff" : "var(--color-text-muted)",
              }}
            >
              हिंदी
            </button>
          </div>

          <span
            className="tiny"
            style={{
              display: "none",
              padding: "6px 10px",
              borderRadius: 999,
              background: "#eff6ff",
              color: "#1e40af",
              border: "1px solid #bfdbfe",
              fontWeight: 600,
            }}
          >
            ● India-focused
          </span>
        </div>
      </div>
    </header>
  );
}
