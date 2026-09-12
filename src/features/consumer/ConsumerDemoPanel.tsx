import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { consumerLegalService } from "@/services/legal/consumer/consumerLegal.service";
import { CONSUMER_SCENARIOS } from "@/data/consumerScenarios";
import type { FindRelevantConsumerLawResult } from "@/services/legal/consumer/consumerLegal.service";
import { DemoBadge } from "@/components/ui/Badge";
import { Disclaimer } from "@/components/common/Disclaimer";

export function ConsumerDemoPanel() {
  const { lang } = useLanguage();
  // Intentionally EMPTY on mount: pre-filling sample text into an
  // intake-styled field made sample complaints indistinguishable from user
  // input (audit Finding 1). Samples remain one tap away via "Try:" buttons.
  const [input, setInput] = useState("");
  const [result, setResult] = useState<FindRelevantConsumerLawResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (text: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await consumerLegalService.findRelevantConsumerLaw({
        userProblem: text,
        onlyProductionAllowed: true,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="container" style={{ padding: "28px 0 8px" }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <h3 className="h3" style={{ color: "var(--color-primary)" }}>
            {lang === "hi" ? "कंज्यूमर शिकायत — समस्या समझें" : "Consumer grievance — Understand my problem"}
          </h3>
          <span className="tiny muted">Domain: consumer_grievance</span>
        </div>

        <p className="small muted" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
          {lang === "hi"
            ? "अपनी समस्या अपने शब्दों में लिखें। हम बताएंगे कि यह किस तरह की कंज्यूमर शिकायत लगती है और कौन से सत्यापित स्रोत प्रासंगिक हो सकते हैं।"
            : "Describe what happened in your own words. We’ll show what kind of consumer issue it looks like and which verified sources may be relevant — honestly, with citations."}
        </p>

        <label htmlFor="consumer-input" className="tiny" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          {lang === "hi" ? "क्या हुआ?" : "What happened?"}
        </label>
        <textarea
          id="consumer-input"
          className="textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder={lang === "hi" ? "उदा. मैंने ऑनलाइन लैपटॉप खरीदा, खराब निकला, विक्रेता रिफंड नहीं दे रहा" : "E.g. I bought a laptop online and it arrived damaged. Seller isn't refunding me."}
          style={{ marginTop: 6 }}
        />

        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn--primary" onClick={() => handleAnalyze(input)} disabled={!input.trim() || loading}>
            {loading ? (lang === "hi" ? "समझ रहे हैं…" : "Understanding…") : lang === "hi" ? "मेरी समस्या समझें" : "Understand my problem"} →
          </button>
          <span className="tiny muted">{lang === "hi" ? "कोई जटिल फॉर्म नहीं" : "No complex forms"}</span>
        </div>

        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span className="tiny muted">Try:</span>
          {CONSUMER_SCENARIOS.map((s) => (
            <button
              key={s.id}
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setInput(s.description);
                handleAnalyze(s.description);
              }}
              style={{ fontSize: "0.8rem", padding: "6px 10px" }}
            >
              {s.title.slice(0, 28)}…
            </button>
          ))}
        </div>

        {error && (
          <div className="card" style={{ padding: 12, marginTop: 14, background: "#fef2f2", borderColor: "#fecaca" }}>
            <strong className="small" style={{ color: "#991b1b" }}>Error</strong>
            <p className="small muted" style={{ margin: "4px 0 0" }}>{error}</p>
          </div>
        )}

        {result && (
          <div className="stack" style={{ gap: 14, marginTop: 18 }}>
            <hr className="divider" />

            {/* What I understood */}
            <div className="card" style={{ padding: 14, background: "var(--color-surface-2)" }}>
              <h4 className="h3" style={{ marginBottom: 6 }}>{lang === "hi" ? "हमने क्या समझा" : "What I understood"}</h4>
              <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>
                <strong>Fact (your words):</strong> “{input.slice(0, 160)}”
              </p>
              <p className="small muted" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>
                {result.classification.explanation}
              </p>
              <p className="tiny muted" style={{ margin: "8px 0 0", fontStyle: "italic" }}>
                Allegation vs Fact: Your description is an allegation, not an established fact. System interpretation is not a legal finding.
              </p>
            </div>

            {/* Possible issue */}
            <div className="card" style={{ padding: 14 }}>
              <h4 className="h3" style={{ marginBottom: 6 }}>{lang === "hi" ? "संभावित समस्या" : "Possible issue"}</h4>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                <span className="tiny" style={{ padding: "4px 8px", borderRadius: 999, background: "var(--color-primary)", color: "#fff", fontWeight: 700 }}>
                  {result.domain}
                </span>
                {result.issueTypes.length > 0 ? (
                  result.issueTypes.map((t) => (
                    <span key={t} className="tiny" style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid var(--color-border)", background: "#fff" }}>
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="tiny muted">{lang === "hi" ? "अस्पष्ट — अधिक जानकारी चाहिए" : "Unclear — need more facts"}</span>
                )}
              </div>
              {result.classification.isVague && (
                <p className="small" style={{ margin: 0, color: "#92400e" }}>
                  {lang === "hi" ? "कृपया थोड़ा और बताएं — उत्पाद/सेवा, तारीख, भुगतान, विक्रेता का जवाब।" : "Please share a bit more — product/service, date, amount, seller response — so we can guide you."}
                </p>
              )}
            </div>

            {/* Relevant legal information */}
            <div className="card" style={{ padding: 14 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                <h4 className="h3">{lang === "hi" ? "प्रासंगिक कानूनी जानकारी" : "Relevant legal information"}</h4>
                <span className="tiny muted">{result.validation.status}</span>
              </div>

              {result.claims.length === 0 ? (
                <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
                  {result.validation.reasons[0] ?? (lang === "hi" ? "कोई सत्यापित स्रोत नहीं मिला।" : "No verified legal sources found for this scenario.")}
                </p>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {result.claims.map((claim) => (
                    <div key={claim.id} style={{ padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, background: "#fff" }}>
                      <p className="small" style={{ margin: 0, fontWeight: 600, lineHeight: 1.4 }}>“{claim.statement.slice(0, 220)}”</p>
                      <p className="small muted" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>{claim.explanation}</p>
                      <p className="tiny" style={{ margin: "8px 0 0", color: "#065f46" }}>{claim.factVsLawNote}</p>
                      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        <span className="tiny" style={{ padding: "3px 7px", borderRadius: 999, background: claim.verified ? "#ecfdf5" : "#fef2f2", color: claim.verified ? "#065f46" : "#991b1b", border: "1px solid currentColor", fontWeight: 700 }}>
                          {claim.verified ? "Verified" : "Unverified"}
                        </span>
                        {claim.provisionIds?.[0] && <span className="tiny muted">{claim.provisionIds[0].split("__")[1] ?? claim.provisionIds[0]}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verified sources */}
            <div className="card" style={{ padding: 14 }}>
              <h4 className="h3" style={{ marginBottom: 6 }}>{lang === "hi" ? "सत्यापित स्रोत" : "Verified sources"}</h4>
              {result.passages.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>{lang === "hi" ? "कोई सत्यापित स्रोत नहीं मिला।" : "No verified sources to show — we’re being honest about it."}</p>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {result.passages.map((p) => (
                    <div key={p.provision.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-border)", background: p.provision.provisionKind === "official_procedure" ? "var(--color-surface-2)" : "#fff" }}>
                      <div className="row" style={{ gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span className="tiny" style={{ fontWeight: 700 }}>{p.source.title}</span>
                        <span className="tiny muted">— {p.provision.sectionIdentifier}</span>
                        <span className="tiny" style={{ padding: "2px 6px", borderRadius: 999, background: p.provision.provisionKind === "legal_provision" ? "#e0e7ff" : "#fef3c7", border: "1px solid var(--color-border)" }}>
                          {p.provision.provisionKind === "legal_provision" ? "legal_provision" : "official_procedure"}
                        </span>
                      </div>
                      <p className="small muted" style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>“{p.provision.text.slice(0, 320)}”</p>
                      <a href={p.source.sourceUrl || p.source.url} target="_blank" rel="noopener noreferrer" className="tiny" style={{ color: "var(--color-primary)", fontWeight: 600, display: "inline-block", marginTop: 6 }}>
                        View source ↗
                      </a>
                    </div>
                  ))}
                  {result.passages.some((p) => p.source.sourceType === "TEST_FIXTURE") && <DemoBadge lang={lang} />}
                </div>
              )}
            </div>

            {/* What still unclear */}
            <div className="card" style={{ padding: 14, background: "#fffbeb", borderColor: "#fde68a" }}>
              <h4 className="h3" style={{ marginBottom: 6 }}>{lang === "hi" ? "अभी क्या स्पष्ट नहीं है" : "What is still unclear"}</h4>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                {!input.toLowerCase().includes("₹") && <li>{lang === "hi" ? "राशि और भुगतान का तरीका" : "Amount paid and payment method"}</li>}
                {!input.toLowerCase().includes("invoice") && !input.toLowerCase().includes("receipt") && <li>{lang === "hi" ? "क्या आपके पास इनवॉइस/रसीद है?" : "Do you have an invoice/receipt?"}</li>}
                {!input.toLowerCase().includes("warranty") && <li>{lang === "hi" ? "वारंटी/ग्यारंटी की स्थिति" : "Warranty/guarantee status"}</li>}
                <li>{lang === "hi" ? "विक्रेता ने लिखित में क्या जवाब दिया?" : "What did the seller say in writing?"}</li>
              </ul>
              <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                {result.validation.reasons.join(" • ")}
              </p>
            </div>

            {/* Confidence */}
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="tiny" style={{ padding: "4px 8px", borderRadius: 999, fontWeight: 700, border: "1px solid", background: result.validation.status === "VERIFIED" ? "#ecfdf5" : result.validation.status === "INSUFFICIENT_GROUNDING" ? "#fef2f2" : "#fffbeb", color: result.validation.status === "VERIFIED" ? "#065f46" : "#92400e" }}>
                {result.validation.status}
              </span>
              <span className="tiny muted">Coverage: {result.coverage.coverageRate} • Verification: {result.coverage.verificationRate}</span>
            </div>

            <Disclaimer />
          </div>
        )}
      </div>
    </section>
  );
}
