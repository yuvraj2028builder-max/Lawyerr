import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

type Props = {
  onSubmit: (text: string) => void;
};

export function Hero({ onSubmit }: Props) {
  const { t, lang } = useLanguage();
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <section
      style={{
        background: `radial-gradient(1200px 600px at 20% -10%, #e0e7ff 0%, transparent 60%), radial-gradient(900px 500px at 90% 0%, #fef3c7 0%, transparent 55%), var(--color-bg)`,
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="container" style={{ padding: "48px 0 36px" }}>
        <div className="grid" style={{ gridTemplateColumns: "1.05fr 0.85fr", gap: 32, alignItems: "center" }}>
          {/* Left: copy + input */}
          <div className="stack" style={{ gap: 18 }}>
            <div className="stack" style={{ gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  className="tiny"
                  style={{
                    background: "#fff",
                    border: "1px solid var(--color-border)",
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontWeight: 600,
                    color: "var(--color-primary)",
                  }}
                >
                  {lang === "hi" ? "उपभोक्ता समस्याओं के लिए" : "For consumer problems"}
                </span>
                <span className="tiny muted">{lang === "hi" ? "कोई जटिल फॉर्म नहीं" : "No complex forms"}</span>
              </div>

              <h1 className="h1" style={{ color: "var(--color-primary)" }}>
                {t("hero.title")} <br />
                <span style={{ color: "var(--color-text)" }}>{t("hero.subtitle")}</span>
              </h1>

              <p className="muted" style={{ margin: 0, fontSize: "1.05rem", lineHeight: 1.6, maxWidth: 560 }}>
                {lang === "hi" ? "अपनी बात बताइए। हम तथ्य व्यवस्थित करने, संबंधित आधिकारिक जानकारी देखने और अगला कदम चुनने में मदद करेंगे।" : "Tell us what happened. We’ll help organize the facts, check relevant official information, and decide what to do next."}
              </p>
            </div>

            {/* Primary intake */}
            <form onSubmit={handleSubmit} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <label htmlFor="hero-input" className="tiny" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                {lang === "hi" ? "क्या हुआ? अपने शब्दों में बताइए" : "What happened? In your own words"}
              </label>

              <textarea
                id="hero-input"
                className="textarea"
                placeholder={t("intake.placeholder")}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                style={{ minHeight: 92 }}
                aria-label="Describe what happened"
              />

              <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
                <div className="row" style={{ gap: 8 }}>
                  <button type="submit" className="btn btn--primary btn--lg" disabled={!text.trim()}>
                    {t("hero.cta.type")} →
                  </button>
                  <span className="tiny muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span aria-hidden>↩</span> Enter
                  </span>
                </div>

                <span className="tiny muted" style={{ maxWidth: 220, lineHeight: 1.4 }}>
                  {lang === "hi" ? "उदा. फोन खराब था और रिफंड नहीं मिला" : 'E.g. “My phone was defective and the seller refused a refund.”'}
                </span>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }} aria-label="What happens next">
                <span className="tiny muted">Next, we ask only useful questions. You can skip what you do not know and correct details before anything is used.</span>
              </div>
            </form>

            <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>
              {lang === "hi" ? "यह कानून फर्म नहीं है और परिणाम की गारंटी नहीं है।" : "NyayaSetu is not a law firm and cannot guarantee an outcome."} • {lang === "hi" ? "लोकल डेमो मोड: डेटा इस ब्राउज़र तक सीमित है।" : "Local demo mode: data is limited to this browser."}
            </p>
          </div>

          {/* Right: journey visual */}
          <div className="card" style={{ padding: 18, background: "#fff" }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
              <strong className="small" style={{ letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-primary)" }}>
                {lang === "hi" ? "आपका सफ़र" : "Your journey"}
              </strong>
              <span className="tiny muted">{lang === "hi" ? "Problem → Action" : "Problem → Action"}</span>
            </div>

            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { k: "Understand", hi: "समझें", desc: "What happened, in plain language", hiDesc: "साधारण भाषा में क्या हुआ", active: true },
                { k: "Verify", hi: "जाँचें", desc: "Check trusted sources", hiDesc: "भरोसेमंद स्रोतों से जाँच", active: false },
                { k: "Decide", hi: "तय करें", desc: "Your options, clearly", hiDesc: "आपके विकल्प, साफ़ तौर पर", active: false },
                { k: "Act", hi: "करें", desc: "Concrete next steps", hiDesc: "ठोस अगले कदम", active: false },
                { k: "Track", hi: "नज़र रखें", desc: "Deadlines & progress", hiDesc: "समय-सीमा और प्रगति", active: false },
                { k: "Escalate", hi: "मदद लें", desc: "Human help when needed", hiDesc: "ज़रूरत पर व्यक्ति से मदद", active: false },
              ].map((step, i) => (
                <li
                  key={step.k}
                  className="row"
                  style={{
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: step.active ? "var(--color-primary)" : "var(--color-surface-2)",
                    color: step.active ? "#fff" : "var(--color-text)",
                    border: `1px solid ${step.active ? "var(--color-primary)" : "var(--color-border)"}`,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      background: step.active ? "#fff" : "#fff",
                      color: step.active ? "var(--color-primary)" : "var(--color-text-muted)",
                      border: "1px solid var(--color-border)",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
                      {lang === "hi" ? step.hi : step.k}
                    </span>
                    <span className="tiny" style={{ opacity: step.active ? 0.85 : 0.7, lineHeight: 1.2 }}>
                      {lang === "hi" ? step.hiDesc : step.desc}
                    </span>
                  </span>
                  {step.active && (
                    <span className="tiny" style={{ background: "#fef3c7", color: "#92400e", padding: "4px 8px", borderRadius: 999, fontWeight: 700 }}>
                      {lang === "hi" ? "अभी" : "Now"}
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <div
              className="small muted"
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 10,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "#065f46" }}>{lang === "hi" ? "ईमानदार मदद" : "Honest escalation."}</strong>{" "}
              {lang === "hi"
                ? "AI को पता है कब रुकना है — हम बताएँगे कब वकील / DLSA से बात करनी चाहिए।"
                : "The AI knows when not to pretend — we'll tell you when to talk to a lawyer or DLSA."}
            </div>
          </div>
        </div>
      </div>

      {/* Responsive: stack on small screens */}
      <style>{`@media (max-width: 880px) { section .grid { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
