import { useLanguage } from "@/context/LanguageContext";

export function Footer() {
  const { t } = useLanguage();
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
              © 2026 NyayaSetu. {t("privacy.title")} • We never ask for Aadhaar or bank passwords. •{" "}
              <a href="#" onClick={(e) => e.preventDefault()}>
                {t("footer.privacy")}
              </a>{" "}
              •{" "}
              <a href="#" onClick={(e) => e.preventDefault()}>
                {t("footer.terms")}
              </a>
            </p>
          </div>
          <div className="small muted" style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600, color: "var(--color-text)" }}>Problem → Understand → Verify → Act</div>
            <div>Made for everyday Indians.</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
