/**
 * Minor pass — footer links, confirm race, Hindi gaps, summary details.
 * Each fix below has its regression test in this file. The five
 * critical/high items are untouched (covered by intakeIntegrity.test.ts).
 */
import { describe, expect, it } from "vitest";

async function renderWithProviders(ui: (React: typeof import("react")) => React.ReactElement) {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { LanguageProvider } = await import("@/context/LanguageContext");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(LanguageProvider, null, ui(React)));
  });
  return {
    container,
    clickButton: async (text: string): Promise<boolean> => {
      const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
      if (!btn) return false;
      await act(async () => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      return true;
    },
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

// ─── M2: confirming twice never duplicates cases or facts ───────────────────

describe("Minor M2 — double activation is safe", () => {
  it("consumer confirm twice creates exactly one case", async () => {
    const { consumerIntakeEngine } = await import("@/services/consumerIntake/consumerIntakeEngine");
    const { caseEngine } = await import("@/services/caseEngine.service");
    const before = (await caseEngine.listCases("local_user")).length;
    const s = consumerIntakeEngine.createSession();
    consumerIntakeEngine.submitNarrative(s.sessionId, "Bought headphones online, arrived broken, seller silent.");
    // Drive to ready by answering whatever is asked (bounded loop).
    for (let i = 0; i < 30; i++) {
      const cur = consumerIntakeEngine.getSession(s.sessionId)!;
      if (cur.status === "ready" || cur.status === "complete") break;
      const { getNextQuestion } = await import("@/services/consumerIntake/questionPlanner");
      const q = getNextQuestion(cur);
      if (!q) break;
      try {
        consumerIntakeEngine.answerQuestion(s.sessionId, q.id as never, "test answer");
      } catch {
        try { consumerIntakeEngine.skipQuestion(s.sessionId, q.id as never); } catch { break; }
      }
    }
    consumerIntakeEngine.confirm(s.sessionId);
    const first = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
    const second = await consumerIntakeEngine.createCaseFromIntake(s.sessionId);
    expect(second.id).toBe(first.id);
    const after = (await caseEngine.listCases("local_user")).length;
    expect(after - before).toBe(1);
  });

  it("concurrent legacy answers for one question persist exactly one fact", async () => {
    const { beginIntakeFromPrompt, answerIntakeQuestion } = await import("@/services/legacyIntakeFlow.service");
    const { intakeEngine } = await import("@/services/intakeEngine.service");
    const { caseEngine } = await import("@/services/caseEngine.service");
    const { intake } = await beginIntakeFromPrompt("Double-tap probe refund");
    const q = intakeEngine.nextQuestion(intake)!;
    await Promise.all([
      answerIntakeQuestion(intake, q.key, "same answer"),
      answerIntakeQuestion(intake, q.key, "same answer"),
    ]);
    const facts = ((await caseEngine.getCase(intake.caseId))?.facts ?? []).filter((f) => f.key === q.key);
    expect(facts).toHaveLength(1);
    expect(facts[0].value).toBe("same answer");
  });

  it("sequential answers to different questions still persist separately", async () => {
    const { beginIntakeFromPrompt, answerIntakeQuestion } = await import("@/services/legacyIntakeFlow.service");
    const { intakeEngine } = await import("@/services/intakeEngine.service");
    const { caseEngine } = await import("@/services/caseEngine.service");
    const { intake } = await beginIntakeFromPrompt("Sequential probe deposit");
    const q1 = intakeEngine.nextQuestion(intake)!;
    const s1 = await answerIntakeQuestion(intake, q1.key, "first answer");
    const q2 = intakeEngine.nextQuestion(s1)!;
    expect(q2.key).not.toBe(q1.key);
    await answerIntakeQuestion(s1, q2.key, "second answer");
    const facts = (await caseEngine.getCase(intake.caseId))?.facts ?? [];
    expect(facts.some((f) => f.key === q1.key && f.value === "first answer")).toBe(true);
    expect(facts.some((f) => f.key === q2.key && f.value === "second answer")).toBe(true);
  });
});

// ─── M3: Hindi gaps closed ──────────────────────────────────────────────────

describe("Minor M3 — Hindi UI has no English-only leftovers", () => {
  it("legacy Skip buttons render Hindi when Hindi is selected", async () => {
    const React = await import("react");
    const { act } = React;
    const { createRoot } = await import("react-dom/client");
    const { LanguageProvider } = await import("@/context/LanguageContext");
    const { IntakeCard } = await import("@/features/intake/IntakeCard");
    const { INTAKE_QUESTIONS } = await import("@/data/intakeQuestions");
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.setItem("nyayasetu_lang", "hi");
    try {
      const q = INTAKE_QUESTIONS.find((x) => x.key === "opposing_party")!;
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(React.createElement(LanguageProvider, null, React.createElement(IntakeCard, { question: q, onAnswer: () => undefined, onSkip: () => undefined })));
      });
      const labels = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
      expect(labels.some((t) => t?.includes("छोड़ें"))).toBe(true);
      expect(labels.some((t) => t === "Skip")).toBe(false);
      await act(async () => { root.unmount(); });
      container.remove();
    } finally {
      localStorage.removeItem("nyayasetu_lang");
    }
  });

  it("footer strings exist in both languages", async () => {
    const { dictionaries } = await import("@/i18n/dictionaries");
    for (const key of ["footer.neverAsk", "footer.journey", "footer.madeFor"]) {
      expect(dictionaries.en[key]).toBeTruthy();
      expect(dictionaries.hi[key]).toBeTruthy();
      expect(dictionaries.hi[key]).not.toBe(dictionaries.en[key]);
    }
  });
});

// ─── M4: summary preserves details instead of normalizing them away ─────────

describe("Minor M4 — summary keeps seller casing and timing details", () => {
  it("extractSeller preserves the user's casing", async () => {
    const { extractSeller } = await import("@/services/consumerIntake/extraction");
    expect(extractSeller("I bought a phone on Amazon for Rs 25000")?.value).toBe("Amazon");
    expect(extractSeller("Ordered from Flipkart last week")?.value).toBe("Flipkart");
  });

  it("summary shows the seller as typed and the timing as mentioned", async () => {
    const { consumerIntakeEngine } = await import("@/services/consumerIntake/consumerIntakeEngine");
    const s = consumerIntakeEngine.createSession();
    consumerIntakeEngine.submitNarrative(
      s.sessionId,
      "I bought a phone on Amazon five days ago. It arrived with a cracked screen and they refused a refund."
    );
    const summary = consumerIntakeEngine.getSummary(s.sessionId);
    expect(summary).toContain("Amazon");
    expect(summary).not.toContain("from amazon");
    expect(summary.toLowerCase()).toContain("five days ago");
  });

  it("exact purchase dates appear verbatim when given", async () => {
    const { consumerIntakeEngine } = await import("@/services/consumerIntake/consumerIntakeEngine");
    const s = consumerIntakeEngine.createSession();
    consumerIntakeEngine.submitNarrative(s.sessionId, "Bought a watch on Flipkart. Order arrived broken, refund denied.");
    consumerIntakeEngine.answerQuestion(s.sessionId, "purchase_date", "2026-08-01");
    const summary = consumerIntakeEngine.getSummary(s.sessionId);
    expect(summary).toContain("2026-08-01");
  });
});

// ─── M5: small-screen rules exist (static review; device testing still owed) ─
// The audit explicitly left 375px unverified. These tests pin the static
// safeguards so they cannot regress silently; they do NOT claim a device pass.

describe("Minor M5 — small-screen safeguards present", () => {
  it("global CSS wraps rows, breaks long card text, and budgets 480px", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");
    expect(css).toMatch(/\.row\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toContain("@media (max-width: 480px)");
    expect(css).toContain("overflow-wrap: break-word");
    expect(css).toMatch(/\.card pre\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("header bar wraps instead of clipping at narrow widths", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const header = readFileSync(join(process.cwd(), "src", "components", "layout", "Header.tsx"), "utf8");
    expect(header).toContain("flexWrap");
    expect(header).toContain("minHeight");
    expect(header).not.toMatch(/justifyContent: "space-between", height: 64 \}/);
  });
});

// ─── Medium: evidence toggle visibly flips, exactly once ────────────────────

describe("Medium — evidence toggle feedback", () => {
  it("Mark available flips to available; a second click mid-flight is ignored", async () => {
    const React = await import("react");
    const { act } = React;
    const { createRoot } = await import("react-dom/client");
    const { LanguageProvider } = await import("@/context/LanguageContext");
    const { EvidenceLockerPanel } = await import("@/features/evidence/EvidenceLockerPanel");
    const { caseEngine } = await import("@/services/caseEngine.service");
    const { evidenceService } = await import("@/services/evidence.service");
    const { vi } = await import("vitest");
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

    const kase = await caseEngine.createCase({ description: "toggle probe" });
    await evidenceService.addEvidence({ caseId: kase.id, type: "invoice_receipt", label: "Bill", status: "missing" });

    // Hold the first toggle in flight so the second click lands mid-flight.
    let releaseUpdate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseUpdate = resolve; });
    const realUpdate = evidenceService.updateEvidence.bind(evidenceService);
    const spy = vi.spyOn(evidenceService, "updateEvidence").mockImplementationOnce(async (...args) => {
      await gate;
      return realUpdate(...args);
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let latest = (await caseEngine.getCase(kase.id))!;
    const renderLatest = () => {
      root.render(
        React.createElement(LanguageProvider, null,
          React.createElement(EvidenceLockerPanel, {
            kase: latest,
            onUpdate: (c: typeof latest) => {
              latest = c;
              renderLatest();
            },
          }))
      );
    };
    await act(async () => { renderLatest(); });
    const findToggle = () =>
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent === "Mark available" || b.textContent === "Mark missing" || b.textContent === "Saving…");
    try {
      expect(findToggle()?.textContent).toBe("Mark available");

      act(() => { findToggle()!.click(); });
      await act(async () => { await Promise.resolve(); });
      // Mid-flight: visible Saving state on a disabled button.
      expect(findToggle()?.textContent).toBe("Saving…");
      expect(findToggle()?.disabled).toBe(true);
      // Second physical click: disabled buttons ignore .click(), exactly
      // like a real browser — the audit's zero-net-change cannot happen.
      act(() => { findToggle()!.click(); });
      releaseUpdate();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(findToggle()?.textContent).toBe("Mark missing");
      expect((await caseEngine.getCase(kase.id))?.evidence.find((e) => e.label === "Bill")?.status).toBe("available");
    } finally {
      spy.mockRestore();
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });
});

// ─── M1: Privacy/Terms links open real content ──────────────────────────────

describe("Minor M1 — footer links lead somewhere real", () => {
  it("Privacy opens a dialog with the privacy note; Terms opens terms; both close", async () => {
    const { Footer } = await import("@/components/layout/Footer");
    const { container, clickButton, cleanup } = await renderWithProviders((R) => R.createElement(Footer));
    try {
      // No dead href="#" anchors remain.
      expect(container.querySelector('a[href="#"]')).toBeNull();
      expect(container.querySelector('[role="dialog"]')).toBeNull();

      expect(await clickButton("Privacy")).toBe(true);
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain("never ask for Aadhaar");
      expect(dialog?.textContent).toContain("not a law firm");

      expect(await clickButton("Close")).toBe(true);
      expect(container.querySelector('[role="dialog"]')).toBeNull();

      expect(await clickButton("Terms")).toBe(true);
      const terms = container.querySelector('[role="dialog"]');
      expect(terms?.textContent).toContain("not legal advice");
      expect(terms?.textContent).toContain("DLSA");
    } finally {
      await cleanup();
    }
  });

  it("footer copy is localized (no hardcoded English leftovers)", async () => {
    const { dictionaries } = await import("@/i18n/dictionaries");
    for (const key of ["footer.neverAsk", "footer.journey", "footer.madeFor", "footer.close", "footer.privacyBody", "footer.termsTitle", "footer.termsBody"]) {
      expect(dictionaries.en[key], `en:${key}`).toBeTruthy();
      expect(dictionaries.hi[key], `hi:${key}`).toBeTruthy();
      expect(dictionaries.hi[key]).not.toBe(dictionaries.en[key]);
    }
  });
});
