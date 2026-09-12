import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

export function Footer() {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState<"privacy" | "terms" | null>(null);
  return (
    <footer style={{ borderTop: "1px solid var(--color-border)", background: "#fff", marginTop: 48 }}>
      <div className="container" style={{ padding: "28px 0 32px" }}>
        <div className="grid" style={{ gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
          <div className="stack" style={{ gap: 8 }}>
            <strong style={{ color: "var(--color-primary)" }}>{t("brand.name")}</strong>
            <p className="small muted" style={{ margin: 0, maxWidth: 520, lineHeight: 1.6 }}>
              {t("disclaimer")}
            </p>
            <p className="tiny muted" style={{ margin: 0 }}>
              © 2026 NyayaSetu. {t("privacy.title")} • {t("footer.neverAsk")} •{" "}
              <button
                type="button"
                className="tiny"
                onClick={() => setOpen("privacy")}
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--color-primary)", fontWeight: 600, textDecoration: "underline" }}
              >
                {t("footer.privacy")}
              </button>{" "}
              •{" "}
              <button
                type="button"
                className="tiny"
                onClick={() => setOpen("terms")}
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--color-primary)", fontWeight: 600, textDecoration: "underline" }}
              >
                {t("footer.terms")}
              </button>
            </p>
          </div>
          <div className="small muted" style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{t("footer.journey")}</div>
            <div>{t("footer.madeFor")}</div>
          </div>
        </div>
      </div>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={open === "privacy" ? t("footer.privacy") : t("footer.termsTitle")}
          onClick={() => setOpen(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ padding: 20, maxWidth: 560, background: "#fff", maxHeight: "80vh", overflow: "auto" }}
          >
            <h3 className="h3" style={{ margin: "0 0 8px" }}>
              {open === "privacy" ? t("footer.privacy") : t("footer.termsTitle")}
            </h3>
            <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>
              {open === "privacy" ? t("footer.privacyBody") : t("footer.termsBody")}
            </p>
            <p className="tiny muted" style={{ margin: "10px 0 0" }}>
              {lang === "hi" ? "यह डेमो कानूनी सलाह नहीं देता।" : "This demo does not provide legal advice."}
            </p>
            <button type="button" autoFocus className="btn btn--secondary btn--sm" style={{ marginTop: 12 }} onClick={() => setOpen(null)}>
              {t("footer.close")}
            </button>
          </div>
        </div>
      )}
    </footer>
  );
}
