import type { LegalClaim, RetrievalPassage } from "@/types/domain";
import { useLanguage } from "@/context/LanguageContext";
import { DemoBadge } from "@/components/ui/Badge";

export function LegalPassagesPanel({
  claims,
  passages,
}: {
  claims: LegalClaim[];
  passages?: RetrievalPassage[];
}) {
  const { lang } = useLanguage();

  // If no claims and no passages — honest empty state
  if ((!claims || claims.length === 0) && (!passages || passages.length === 0)) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 className="h3" style={{ marginBottom: 8 }}>
          {lang === "hi" ? "कानून क्या कहता है" : "What the law says"}
        </h3>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {lang === "hi"
            ? "हमारे पास इस विषय के लिए अभी कोई सत्यापित कानूनी स्रोत नहीं है। हम आपके तथ्यों के आधार पर सामान्य जानकारी दे रहे हैं।"
            : "We don't have verified legal information for this yet in our corpus. This area will show exact source passages when our primary legal corpus is loaded."}
        </p>
        <p className="tiny muted" style={{ margin: "10px 0 0", background: "var(--color-surface-2)", padding: "8px 10px", borderRadius: 8 }}>
          {lang === "hi"
            ? "न्यायसेतु सिर्फ सामान्य जानकारी देता है, कानूनी सलाह नहीं। कृपया वकील या DLSA से जाँच करें।"
            : "NyayaSetu shows only general information, not legal advice. Please verify with a lawyer or DLSA."}
        </p>
      </div>
    );
  }

  const hasMock = claims.some((c) => c.isMock) || passages?.some((p) => p.source.isMock);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h3 className="h3">{lang === "hi" ? "कानून क्या कहता है — उपलब्ध स्रोतों से" : "What the law says — from sources available"}</h3>
        <span className="row" style={{ gap: 6 }}>
          {hasMock && <DemoBadge lang={lang} />}
          <span
            className="tiny"
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface-2)",
              fontWeight: 600,
            }}
          >
            {lang === "hi" ? "सत्यापित स्रोत" : "Traceable"}
          </span>
        </span>
      </div>

      {hasMock && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 8,
            padding: "8px 10px",
            marginBottom: 12,
          }}
        >
          <p className="tiny" style={{ margin: 0, color: "#92400e", fontWeight: 600 }}>
            TEST FIXTURE — NOT LAW — Synthetic passages for testing retrieval only. Not a government source.
          </p>
        </div>
      )}

      <div className="stack" style={{ gap: 12 }}>
        {(passages && passages.length > 0 ? passages : claims.map((c) => ({
          source: c.sources[0],
          provision: { sectionIdentifier: c.citationText ?? "", text: c.statement } as unknown as RetrievalPassage["provision"],
          relevanceScore: 0,
          strategy: "keyword" as const,
          snippet: c.statement,
          verified: c.verified,
          productionAllowed: c.sources[0]?.productionAllowed === true,
        }))).slice(0, 5).map((p, idx) => {
          const claim = claims[idx];
          const source = (p as RetrievalPassage).source ?? claim?.sources[0];
          const provisionId = (p as RetrievalPassage).provision?.sectionIdentifier ?? claim?.provisionIds?.[0] ?? "";
          const verified = (p as RetrievalPassage).verified ?? claim?.verified ?? false;
          const prodAllowed = (p as RetrievalPassage).productionAllowed ?? source?.productionAllowed ?? false;

          return (
            <div key={idx} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--color-border)", background: "#fff" }}>
              <div className="row" style={{ gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                <span
                  className="tiny"
                  style={{
                    padding: "3px 7px",
                    borderRadius: 999,
                    fontWeight: 700,
                    background: verified && prodAllowed ? "#ecfdf5" : verified ? "#fef3c7" : "#fef2f2",
                    color: verified && prodAllowed ? "#065f46" : verified ? "#92400e" : "#991b1b",
                    border: "1px solid currentColor",
                  }}
                >
                  {verified && prodAllowed ? (lang === "hi" ? "सत्यापित" : "Verified") : verified ? "Test-verified" : lang === "hi" ? "असत्यापित" : "Unverified"}
                </span>
                <span className="tiny muted">
                  {(p as RetrievalPassage).strategy ?? "keyword"} • score {(p as RetrievalPassage).relevanceScore ?? "—"}
                </span>
                {source?.documentVersion && <span className="tiny muted">v{source.documentVersion}</span>}
                {source?.versionStatus && <span className="tiny muted">• {source.versionStatus}</span>}
              </div>

              <p className="small" style={{ margin: 0, fontWeight: 600, lineHeight: 1.4 }}>
                {source?.title ?? "Unknown source"} — {provisionId}
              </p>
              <p className="small muted" style={{ margin: "6px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                “{(p as RetrievalPassage).snippet ?? (p as RetrievalPassage).provision?.text ?? claim?.statement ?? ""}”
              </p>
              <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <span className="tiny muted" style={{ fontStyle: "italic" }}>
                  {claim?.citationText ?? source?.citation ?? ""}
                </span>
                {source?.sourceUrl || source?.url ? (
                  <a
                    href={source!.sourceUrl || source!.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tiny"
                    style={{ color: "var(--color-primary)", fontWeight: 600 }}
                  >
                    {lang === "hi" ? "स्रोत देखें" : "View source"} ↗
                  </a>
                ) : null}
              </div>
              {source?.isMock && (
                <p className="tiny" style={{ margin: "6px 0 0", color: "#92400e" }}>
                  This source is synthetic and marked productionAllowed=false — it cannot be used for verified legal advice.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="tiny muted" style={{ margin: "12px 0 0", background: "var(--color-surface-2)", padding: "8px 10px", borderRadius: 8, lineHeight: 1.5 }}>
        {lang === "hi"
          ? "यह जानकारी न्यायसेतु के उपलब्ध स्रोतों पर आधारित है और वकील की सलाह का विकल्प नहीं है।"
          : "This information is based on sources available to NyayaSetu and is not a substitute for advice from a qualified lawyer."}
      </p>
    </div>
  );
}
