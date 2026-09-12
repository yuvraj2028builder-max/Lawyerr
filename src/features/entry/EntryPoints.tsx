import { useLanguage } from "@/context/LanguageContext";

type Props = { onSelect: (prompt: string) => void };

export function EntryPoints({ onSelect }: Props) {
  const { t, lang } = useLanguage();

  const items: Array<{ key: string; label: string; hint: string; icon: string }> = [
    { key: "defective", label: lang === "hi" ? "खराब या क्षतिग्रस्त उत्पाद" : "Defective or damaged product", hint: lang === "hi" ? "उत्पाद काम नहीं कर रहा या खराब आया" : "The product arrived damaged or does not work", icon: "📦" },
    { key: "refund", label: lang === "hi" ? "रिफंड नहीं मिला" : "Refund refused or delayed", hint: lang === "hi" ? "विक्रेता रिफंड नहीं दे रहा" : "The seller will not return your money", icon: "↩️" },
    { key: "delivery", label: lang === "hi" ? "ऑर्डर नहीं मिला" : "Order not delivered", hint: lang === "hi" ? "भुगतान के बाद भी डिलीवरी नहीं हुई" : "You paid but the order did not arrive", icon: "🚚" },
    { key: "service", label: lang === "hi" ? "वारंटी या सेवा समस्या" : "Warranty or service problem", hint: lang === "hi" ? "मरम्मत या सेवा में मदद चाहिए" : "You need help with repair or service", icon: "🛠️" },
  ];

  return (
    <section className="container" style={{ padding: "28px 0 8px" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <h2 className="h2" style={{ color: "var(--color-primary)" }}>{t("entry.title")}</h2>
        <span className="tiny muted">{lang === "hi" ? "एक पर टैप करें — हम सवाल पूछेंगे" : "Tap one — we'll ask gentle follow-ups"}</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onSelect(it.label)}
            className="card card--hover"
            style={{
              textAlign: "left",
              padding: 16,
              cursor: "pointer",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              background: "#fff",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                display: "grid",
                placeItems: "center",
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              {it.icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.35, color: "var(--color-text)" }}>
                “{it.label}”
              </span>
              <span className="tiny muted" style={{ lineHeight: 1.4 }}>{it.hint}</span>
            </span>
            <span aria-hidden style={{ color: "var(--color-text-faint)", fontWeight: 600 }}>›</span>
          </button>
        ))}
      </div>
    </section>
  );
}
