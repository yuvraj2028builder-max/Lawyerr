import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import type { IntakeQuestion } from "@/types/domain";

export function IntakeCard({
  question,
  onAnswer,
  onSkip,
}: {
  question: IntakeQuestion;
  onAnswer: (value: unknown) => void;
  onSkip?: () => void;
}) {
  const { lang } = useLanguage();
  const [text, setText] = useState("");
  const [num, setNum] = useState("");

  // Belt and suspenders with key={question.id} at call sites: whenever the
  // question changes, prior typed input is discarded so a stale answer can
  // never be submitted for a different question.
  useEffect(() => {
    setText("");
    setNum("");
  }, [question.id]);

  const qText = lang === "hi" && question.questionHi ? question.questionHi : question.question;

  if (question.type === "choice" && question.choices) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.4 }}>{qText}</p>
        {question.helpText && <p className="small muted" style={{ margin: "6px 0 12px" }}>{question.helpText}</p>}
        <div className="grid" style={{ gap: 8 }}>
          {question.choices.map((c) => (
            <button
              key={c.value}
              className="btn btn--secondary"
              style={{ justifyContent: "flex-start", borderRadius: 12, padding: "12px 14px" }}
              onClick={() => onAnswer(c.value)}
            >
              {lang === "hi" && c.labelHi ? c.labelHi : c.label}
            </button>
          ))}
        </div>
        {!question.required && onSkip && (
          <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={onSkip}>
            {lang === "hi" ? "छोड़ें" : "Skip"}
          </button>
        )}
      </div>
    );
  }

  if (question.type === "boolean") {
    return (
      <div className="card" style={{ padding: 16 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{qText}</p>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn btn--primary" onClick={() => onAnswer(true)}>
            {lang === "hi" ? "हाँ" : "Yes"}
          </button>
          <button className="btn btn--secondary" onClick={() => onAnswer(false)}>
            {lang === "hi" ? "नहीं" : "No"}
          </button>
          {!question.required && onSkip && (
            <button className="btn btn--ghost" onClick={onSkip}>
              {lang === "hi" ? "छोड़ें" : "Skip"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (question.type === "number") {
    return (
      <div className="card" style={{ padding: 16 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>{qText}</label>
        <div className="row" style={{ gap: 8 }}>
          <span className="muted" style={{ fontWeight: 700 }}>
            ₹
          </span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            placeholder={lang === "hi" ? "उदा. 50000" : "e.g. 50000"}
            value={num}
            onChange={(e) => setNum(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn--primary"
            onClick={() => onAnswer(num ? Number(num) : null)}
            disabled={question.required && !num}
          >
            {lang === "hi" ? "आगे" : "Continue"}
          </button>
        </div>
        {!question.required && onSkip && (
          <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={onSkip}>
            {lang === "hi" ? "छोड़ें" : "Skip"}
          </button>
        )}
      </div>
    );
  }

  if (question.type === "date") {
    return (
      <div className="card" style={{ padding: 16 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>{qText}</label>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" type="date" onChange={(e) => e.target.value && onAnswer(e.target.value)} style={{ flex: 1 }} />
          {!question.required && onSkip && (
            <button className="btn btn--ghost" onClick={onSkip}>
              {lang === "hi" ? "छोड़ें" : "Skip"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // text
  return (
    <div className="card" style={{ padding: 16 }}>
      <label htmlFor="intake-text" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
        {qText}
      </label>
      {question.helpText && <p className="small muted" style={{ margin: "0 0 8px" }}>{question.helpText}</p>}
      <textarea
        id="intake-text"
        className="textarea"
        placeholder={lang === "hi" ? "यहाँ लिखें…" : "Type here…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />
      <div className="row" style={{ gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
        {!question.required && onSkip && (
          <button className="btn btn--ghost" onClick={onSkip}>
            {lang === "hi" ? "छोड़ें" : "Skip"}
          </button>
        )}
        <button className="btn btn--primary" disabled={question.required && !text.trim()} onClick={() => onAnswer(text.trim())}>
          {lang === "hi" ? "आगे" : "Continue"}
        </button>
      </div>
    </div>
  );
}
