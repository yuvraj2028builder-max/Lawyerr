/**
 * Bug-fix pass #1 — complaint text/state corruption.
 *
 * The landing-page complaint must survive byte-for-byte into the case:
 * description, what_happened answer, f_what fact, and final summary.
 * No sample text, no stale textarea value, no cross-case pairing, no
 * skip sentinel persisted as a fact.
 */
import { describe, expect, it, vi } from "vitest";
import { intakeEngine, INTAKE_SKIPPED } from "@/services/intakeEngine.service";
import {
  answerIntakeQuestion,
  assertIntakeCaseBinding,
  beginIntakeFromPrompt,
  completeIntake,
  skipIntakeQuestion,
} from "@/services/legacyIntakeFlow.service";
import { caseEngine } from "@/services/caseEngine.service";
import { documentUploadService } from "@/services/documentUpload.service";

function uniqueComplaint(): string {
  return `My mixer grinder burst into flamesIGNITE-${Date.now()}-${Math.random().toString(36).slice(2)} and the refund was denied`;
}

async function driveToCompletion(prompt: string, skipKeys: string[] = []) {
  const { intake: started, kase } = await beginIntakeFromPrompt(prompt);
  let state = started;
  for (;;) {
    const q = intakeEngine.nextQuestion(state);
    if (!q || state.completed) break;
    if (skipKeys.includes(q.key)) {
      state = skipIntakeQuestion(state, q.key);
    } else if (q.type === "number") {
      state = await answerIntakeQuestion(state, q.key, 25000);
    } else if (q.type === "boolean") {
      state = await answerIntakeQuestion(state, q.key, true);
    } else if (q.type === "choice" && q.choices?.length) {
      state = await answerIntakeQuestion(state, q.key, q.choices[0].value);
    } else {
      state = await answerIntakeQuestion(state, q.key, `answer for ${q.key}`);
    }
  }
  const done = await completeIntake(state);
  return { done, kase, state };
}

describe("Fix #1 — landing complaint reaches the case intact", () => {
  it("unique typed text survives end-to-end into description, answers, facts, and summary", async () => {
    const prompt = uniqueComplaint();
    const { done, kase, state } = await driveToCompletion(prompt, ["incident_date"]);
    expect(kase.description).toBe(prompt);
    expect(state.answers["what_happened"]).toBe(prompt);
    const whatFact = (await caseEngine.getCase(kase.id))?.facts.find((f) => f.key === "what_happened");
    expect(whatFact?.value).toBe(prompt);
    // Final case still carries the exact complaint — plan was made for THIS problem.
    expect(done.description).toBe(prompt);
    expect(done.analysis?.whatWeUnderstood.join(" ")).toContain(prompt.slice(0, 120));
  });

  it("skip sentinels are never persisted as case facts", async () => {
    const { done } = await driveToCompletion(uniqueComplaint(), ["incident_date", "opposing_party", "has_document", "desired_outcome", "amount_involved"]);
    const facts = (await caseEngine.getCase(done.id))?.facts ?? [];
    expect(facts.some((f) => f.value === INTAKE_SKIPPED)).toBe(false);
    expect(done.description).toContain("IGNITE-");
  });

  it("concurrent double submits produce independent, internally-consistent cases", async () => {
    const a = `alpha-${Math.random().toString(36).slice(2)} refund denied`;
    const b = `beta-${Math.random().toString(36).slice(2)} deposit kept`;
    const [ra, rb] = await Promise.all([beginIntakeFromPrompt(a), beginIntakeFromPrompt(b)]);
    expect(ra.kase.id).not.toBe(rb.kase.id);
    expect(ra.kase.description).toBe(a);
    expect(rb.kase.description).toBe(b);
    // Answering on A's intake touches only A's case.
    const q = intakeEngine.nextQuestion(ra.intake);
    if (q) await answerIntakeQuestion(ra.intake, q.key, "alpha-only answer");
    const factsB = (await caseEngine.getCase(rb.kase.id))?.facts ?? [];
    expect(factsB.some((f) => String(f.value).includes("alpha-only"))).toBe(false);
  });

  it("blank prompts are rejected with an honest error, never an empty case", async () => {
    await expect(beginIntakeFromPrompt("   ")).rejects.toThrow();
  });

  it("intake states refuse to pair with the wrong case", () => {
    expect(() => assertIntakeCaseBinding({ caseId: "case_A" } as never, "case_B")).toThrow(/wrong case/i);
  });

  it("answer() refuses sentinel values outright", () => {
    const s = intakeEngine.start("c1", null);
    expect(() => intakeEngine.answer(s, "incident_date", INTAKE_SKIPPED)).toThrow(/skip\(\)/i);
  });
});

// ─── Fix #2: Skip always advances, progress never lies, flow terminates ─────

describe("Fix #2 — Skip moves through the whole flow and finishes", () => {
  it("skipping every question changes the question each time and terminates (legal-notice flow)", async () => {
    const { intake: started } = await beginIntakeFromPrompt("I received a legal notice from the court about a hearing");
    let state = started;
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      const q = intakeEngine.nextQuestion(state);
      if (!q) break;
      // The audit bug: same question rendered forever while the counter rose.
      expect(seen).not.toContain(q.key);
      seen.push(q.key);
      // Hard guard at every step: progress never exceeds the true total.
      expect(state.currentStep).toBeLessThanOrEqual(state.questions.length);
      expect(state.totalSteps).toBe(state.questions.length);
      state = skipIntakeQuestion(state, q.key);
    }
    expect(intakeEngine.nextQuestion(state)).toBeNull();
    expect(seen.length).toBeGreaterThan(0);
    expect(state.completed).toBe(true);
    // Completion is reachable and honest after all-skips.
    const done = await completeIntake(state);
    expect(done.status).toBe("action_ready");
    expect(done.description).toContain("legal notice");
  });

  it("skip is idempotent and never inflates progress", () => {
    const state = intakeEngine.start("c1", "consumer_complaint");
    const q = intakeEngine.nextQuestion(state)!;
    const once = skipIntakeQuestion(state, q.key);
    const twice = skipIntakeQuestion(once, q.key);
    expect(twice.currentStep).toBe(once.currentStep);
    expect(twice.currentStep).toBeLessThanOrEqual(twice.totalSteps);
    expect(intakeEngine.nextQuestion(twice)?.key).not.toBe(q.key);
  });

  it("mixed answers and skips still terminate with real answers preserved", async () => {
    const prompt = `Skipped-middle-${Math.random().toString(36).slice(2)} warranty repair refused`;
    let { intake: state } = await beginIntakeFromPrompt(prompt);
    const answeredKeys: string[] = [];
    for (;;) {
      const q = intakeEngine.nextQuestion(state);
      if (!q) break;
      if (q.key === "incident_date" || q.key === "has_document") {
        state = skipIntakeQuestion(state, q.key);
      } else {
        state = await answerIntakeQuestion(state, q.key, q.type === "number" ? 1000 : q.type === "boolean" ? false : (q.choices?.[0]?.value ?? `v-${q.key}`));
        answeredKeys.push(q.key);
      }
    }
    expect(intakeEngine.nextQuestion(state)).toBeNull();
    const done = await completeIntake(state);
    expect(done.description).toBe(prompt);
    const kase = await caseEngine.getCase(done.id);
    for (const key of answeredKeys) {
      expect(kase?.facts.some((f) => f.key === key)).toBe(true);
    }
  });
});

// ─── Fix #3: refresh survival via explicit resume ────────────────────────────

describe("Fix #3 — in-progress work survives refresh and resumes explicitly", () => {
  it("save/load round-trips the exact complaint, answers, and step", async () => {
    const prompt = `Refresh-proof-${Math.random().toString(36).slice(2)} salary not paid`;
    const { intake, kase } = await beginIntakeFromPrompt(prompt);
    const { saveIntakeDraft, loadIntakeDraft, clearIntakeDraft } = await import("@/services/intakeDraftStore.service");
    expect(saveIntakeDraft(kase, intake)).toBe(true);
    // Simulate refresh: fresh read from localStorage.
    const loaded = loadIntakeDraft();
    expect(loaded?.kase.description).toBe(prompt);
    expect(loaded?.intake.answers["what_happened"]).toBe(prompt);
    expect(loaded?.intake.currentStep).toBe(intake.currentStep);
    expect(loaded?.intake.caseId).toBe(loaded?.kase.id);
    clearIntakeDraft();
  });

  it("file bytes are stripped but metadata survives the round-trip", async () => {
    const { intake, kase } = await beginIntakeFromPrompt("draft with file bytes");
    const file = new File(["bytes"], "bill.pdf", { type: "application/pdf" });
    const doc = await documentUploadService.uploadDocument(kase.id, file, "invoice_receipt");
    expect(doc.file).toBeDefined();
    const fresh = (await caseEngine.getCase(kase.id))!;
    const { saveIntakeDraft, loadIntakeDraft, clearIntakeDraft } = await import("@/services/intakeDraftStore.service");
    saveIntakeDraft(fresh, intake);
    const loaded = loadIntakeDraft();
    const loadedDoc = loaded?.kase.documentUploads?.[0];
    expect(loadedDoc?.file).toBeUndefined();
    expect(loadedDoc?.fileName).toBe("bill.pdf");
    clearIntakeDraft();
  });

  it("corrupt, mismatched, and expired drafts load as null — never crash, never wrong-case", async () => {
    const { saveIntakeDraft, loadIntakeDraft, clearIntakeDraft, INTAKE_DRAFT_KEY } = await import("@/services/intakeDraftStore.service");
    // Corrupt JSON.
    localStorage.setItem(INTAKE_DRAFT_KEY, "{not json");
    expect(loadIntakeDraft()).toBeNull();
    // Valid shape but intake bound to a different case.
    const { intake, kase } = await beginIntakeFromPrompt("mismatch probe");
    saveIntakeDraft(kase, intake);
    const raw = JSON.parse(localStorage.getItem(INTAKE_DRAFT_KEY)!);
    raw.intake.caseId = "some-other-case";
    localStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(raw));
    expect(loadIntakeDraft()).toBeNull();
    // Expired draft (8 days old).
    raw.intake.caseId = kase.id;
    raw.savedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(raw));
    expect(loadIntakeDraft()).toBeNull();
    clearIntakeDraft();
    expect(loadIntakeDraft()).toBeNull();
  });

  it("resume is offered only on landing with no active flow and a valid draft", async () => {
    const { shouldOfferResume, summarizeDraft, saveIntakeDraft, loadIntakeDraft, clearIntakeDraft } = await import("@/services/intakeDraftStore.service");
    const { intake, kase } = await beginIntakeFromPrompt("resume offer probe");
    saveIntakeDraft(kase, intake);
    const draft = loadIntakeDraft()!;
    expect(shouldOfferResume("landing", false, draft)).toBe(true);
    expect(shouldOfferResume("intake", false, draft)).toBe(false);
    expect(shouldOfferResume("landing", true, draft)).toBe(false);
    expect(shouldOfferResume("landing", false, null)).toBe(false);
    expect(summarizeDraft(draft)).toContain("resume offer probe".slice(0, 20));
    clearIntakeDraft();
  });

  it("refusing to save a mismatched pair never writes storage", async () => {
    const { saveIntakeDraft, loadIntakeDraft, clearIntakeDraft } = await import("@/services/intakeDraftStore.service");
    clearIntakeDraft();
    const { intake } = await beginIntakeFromPrompt("pair probe");
    const other = await caseEngine.createCase({ description: "other case" });
    expect(saveIntakeDraft(other, intake)).toBe(false);
    expect(loadIntakeDraft()).toBeNull();
  });
});

// ─── Fix #4: legal-notice input gets immediate human-review warning ─────────

describe("Fix #4 — legal-notice urgency fires at intake start", () => {
  it("fires for realistic phrasing variations", async () => {
    const { isUrgentLegalNoticeText } = await import("@/services/escalation.service");
    const mustFire = [
      "I received a legal notice from the seller's lawyer",
      "got a court summons yesterday",
      "there is a court hearing next week",
      "advocate sent me a notice",
      "a court case has been filed against me",
      "mujhe legal notice mila hai",
      "court ka summon aaya hai",
      "कोर्ट से समन आया है",
      "वकील ने नोटिस भेजा है",
      "I need to reply to the notice in 15 days",
    ];
    for (const text of mustFire) {
      expect(isUrgentLegalNoticeText(text)).toBe(true);
    }
    // No notice/court marker — a casual lawyer mention alone is not urgency.
    expect(isUrgentLegalNoticeText("my lawyer friend says reply fast")).toBe(false);
  });

  it("stays quiet for ordinary complaints", async () => {
    const { isUrgentLegalNoticeText } = await import("@/services/escalation.service");
    const quiet = [
      "My phone arrived defective and the seller refused a refund",
      "The shop put up a notice board saying no returns",
      " landlord kept my security deposit",
      "",
      null,
      42,
    ];
    for (const text of quiet) {
      expect(isUrgentLegalNoticeText(text)).toBe(false);
    }
  });

  it("banner condition follows the canonical complaint or the inferred category", async () => {
    const { shouldShowLegalNoticeWarning } = await import("@/services/escalation.service");
    expect(shouldShowLegalNoticeWarning({ answers: { what_happened: "Got a court summons" } }, null)).toBe(true);
    expect(shouldShowLegalNoticeWarning({ answers: { what_happened: "My mixer broke" } }, "legal_notice")).toBe(true);
    expect(shouldShowLegalNoticeWarning({ answers: { what_happened: "My mixer broke" } }, "consumer_complaint")).toBe(false);
    expect(shouldShowLegalNoticeWarning({ answers: { what_happened: "__skipped__" } }, null)).toBe(false);
    expect(shouldShowLegalNoticeWarning({ answers: {} }, null)).toBe(false);
  });

  it("a legal-notice landing complaint reaches intake with the warning armed", async () => {
    const { shouldShowLegalNoticeWarning } = await import("@/services/escalation.service");
    const prompt = "I received a legal notice regarding my loan hearing";
    const { intake, kase } = await beginIntakeFromPrompt(prompt);
    expect(kase.problemCategory).toBe("legal_notice");
    expect(shouldShowLegalNoticeWarning(intake, kase.problemCategory)).toBe(true);
    expect(intake.answers["what_happened"]).toBe(prompt);
  });
});

// ─── Fix #5: domain routing + contradiction re-verified after #1 ────────────
// Verdict: the machinery existed in the consumer engine and was already
// unit-tested, but nothing pinned the exact audit scenarios end to end.
// These tests do that. No engine changes were needed.

describe("Fix #5 — wrong-domain routing and contradiction detection work", () => {
  it("rental/landlord dispute is routed away from the consumer flow", async () => {
    const { consumerIntakeEngine } = await import("@/services/consumerIntake/consumerIntakeEngine");
    const s0 = consumerIntakeEngine.createSession();
    const s1 = consumerIntakeEngine.submitNarrative(
      s0.sessionId,
      "My landlord in Pune is keeping my Rs 40000 security deposit after I vacated last month. He is not responding to calls."
    );
    expect(s1.domain).toBe("rental");
    expect(s1.consumerFlowApplicable).toBe(false);
    expect(s1.domainReason).toBeTruthy();
  });

  it("seller-contact contradiction raises an unresolved conflict with both statements", async () => {
    const { consumerIntakeEngine } = await import("@/services/consumerIntake/consumerIntakeEngine");
    const s0 = consumerIntakeEngine.createSession();
    consumerIntakeEngine.submitNarrative(s0.sessionId, "I bought a mixer grinder online and it arrived damaged.");
    const s1 = consumerIntakeEngine.answerQuestion(s0.sessionId, "attempted_resolution", "I have not contacted the seller yet");
    expect(s1.conflicts.filter((c) => c.status === "unresolved")).toHaveLength(0);
    const s2 = consumerIntakeEngine.answerQuestion(s0.sessionId, "attempted_resolution", "The seller refused my refund request");
    const unresolved = s2.conflicts.filter((c) => c.status === "unresolved");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved[0].message).toContain("I have not contacted the seller yet");
    expect(unresolved[0].message).toContain("The seller refused my refund request");
    // And the user can resolve it by choosing.
    const s3 = consumerIntakeEngine.resolveConflict(s0.sessionId, unresolved[0].field, "later");
    expect(s3.conflicts.find((c) => c.field === unresolved[0].field)?.status).toBe("resolved");
  });

  it("consumer purchase flow still accepts genuine consumer complaints", async () => {
    const { consumerIntakeEngine } = await import("@/services/consumerIntake/consumerIntakeEngine");
    const s0 = consumerIntakeEngine.createSession();
    const s1 = consumerIntakeEngine.submitNarrative(
      s0.sessionId,
      "I bought a phone online for Rs 25000. It arrived defective and the seller denied my refund."
    );
    expect(s1.consumerFlowApplicable).toBe(true);
    expect(s1.conflicts.filter((c) => c.status === "unresolved")).toHaveLength(0);
  });
});

// ─── Finding 2: rental-template contamination is structurally impossible ────
// Root cause: the legacy mock planner hardcoded rental wording for EVERY
// category. Fixed with per-category content + an insufficient-facts gate.

const RENTAL_VOCAB = ["rent agreement", "rent receipt", "tenancy", "landlord", "when you left", "moved out", "evict"];

function planText(plan: { summary: string; items: Array<{ title: string; description: string }> }): string {
  return `${plan.summary} ${plan.items.map((i) => `${i.title} ${i.description}`).join(" ")}`.toLowerCase();
}

describe("Finding 2 — no rental language in non-tenancy plans (matrix)", () => {
  it("legacy planner: every problem category × sparse and rich input stays clean unless tenancy", async () => {
    const { actionPlanService } = await import("@/services/actionPlan.service");
    const categories = ["consumer_complaint", "security_deposit", "rent_dispute", "salary_delay", "cheque_bounce", "legal_notice", "other", null] as const;
    const descriptions = {
      label: "Defective or damaged product",
      vague: "Company cheated me",
      complete: "Bought a mixer grinder for Rs 8000 last month, it stopped working in a week, seller refuses refund",
    };
    for (const category of categories) {
      for (const [kind, description] of Object.entries(descriptions)) {
        const kase = await caseEngine.createCase({ description, problemCategory: category });
        const plan = await actionPlanService.generate({ case: kase });
        const text = planText(plan);
        const tenancyCategory = category === "security_deposit" || category === "rent_dispute";
        const leaked = RENTAL_VOCAB.filter((w) => text.includes(w));
        if (tenancyCategory) {
          // Tenancy wording is legitimate ONLY here — and the plan still builds.
          expect(plan.items.length).toBeGreaterThan(0);
        } else {
          expect(leaked, `${category}/${kind} leaked: ${leaked.join(",")}`).toEqual([]);
        }
      }
    }
  });

  it("consumer planner: every issue type × empty/vague/complete input stays clean", async () => {
    const { consumerActionPlanService } = await import("@/services/actionEngine/consumerActionPlan.service");
    const issueTypes = ["defective_product", "not_delivered", "refund_denied", "refund_delayed", "warranty_issue", "service_not_provided", "poor_service", "misleading_representation", "ecommerce_dispute", "cancellation_dispute", "overcharging", "unfair_contract", "other"] as const;
    const factSets = {
      empty: {},
      vague: { problemDescription: "Company cheated me" },
      complete: { productOrService: "phone", sellerOrProvider: "Acme", amountPaid: { amount: 25000, currency: "INR" as const }, problemDescription: "Arrived defective, refund refused", sellerResponse: "refused" },
    };
    for (const issue of issueTypes) {
      for (const [kind, facts] of Object.entries(factSets)) {
        const plan = await consumerActionPlanService.generate({
          caseId: `matrix_${issue}_${kind}`,
          facts: facts as never,
          issueTypes: [issue] as never,
          evidenceTypes: [],
          desiredOutcomes: [],
          verifiedPassages: [],
        });
        const text = planText(plan);
        const leaked = RENTAL_VOCAB.filter((w) => text.includes(w));
        expect(leaked, `${issue}/${kind} leaked: ${leaked.join(",")}`).toEqual([]);
      }
    }
  });

  it("category-card-only sparse flow yields needs_information, never action-ready", async () => {
    const { intake } = await beginIntakeFromPrompt("Defective or damaged product").then(async ({ intake }) => {
      let state = intake;
      for (;;) {
        const q = intakeEngine.nextQuestion(state);
        if (!q) break;
        state = skipIntakeQuestion(state, q.key);
      }
      return { intake: state };
    });
    const done = await completeIntake(intake);
    expect(done.status).toBe("intake");
    expect(done.actionPlan?.status).toBe("needs_information");
    expect(done.actionPlan?.summary.toLowerCase()).toContain("not enough information");
  });

  it("gate stays open for real narratives even when everything is skipped", async () => {
    let { intake: state } = await beginIntakeFromPrompt("I received a legal notice from the court about a hearing next month please help");
    for (;;) {
      const q = intakeEngine.nextQuestion(state);
      if (!q) break;
      state = skipIntakeQuestion(state, q.key);
    }
    const done = await completeIntake(state);
    expect(done.status).toBe("action_ready");
  });

  it("gate stays open when the user answered at least one real question", async () => {
    const { intake: started } = await beginIntakeFromPrompt("Refund refused");
    let state = started;
    for (;;) {
      const q = intakeEngine.nextQuestion(state);
      if (!q) break;
      state = q.key === "opposing_party"
        ? await answerIntakeQuestion(state, q.key, "Acme Traders")
        : skipIntakeQuestion(state, q.key);
    }
    const done = await completeIntake(state);
    expect(done.status).toBe("action_ready");
  });
});

// ─── Finding 1 (audit path): full landing→intake drive in a real Router ─────
// The service tests above prove the data path; this proves the exact user
// path the auditors walked, including that no sample text sits in any
// intake-styled field at any point.

describe("Finding 1 — audit path end to end in the live Router", () => {
  it("hero text reaches intake with zero sample text anywhere on screen", async () => {
    const React = await import("react");
    const { act } = React;
    const { createRoot } = await import("react-dom/client");
    const App = (await import("@/App")).default;

    // Hermetic: even with a developer .env.local present, this flow stays local.
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    try {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(React.createElement(App));
      });
      // Let lazy below-fold panels resolve — the demo textarea must be
      // present before asserting anything about prefilled content. Poll
      // with a deadline instead of a fixed sleep (suite load varies).
      const textareas = () => Array.from(container.querySelectorAll("textarea")).map((t) => ({ id: t.id, value: (t as HTMLTextAreaElement).value }));
      const deadline = Date.now() + 8000;
      while (textareas().length < 3 && Date.now() < deadline) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
      }

      // Landing: no textarea anywhere may contain sample/complaint text.
      const before = textareas();
      expect(before.length).toBeGreaterThan(0);
      expect(before.map((t) => t.id).sort()).toEqual(["consumer-input", "hero-input", "narrative"]);
      for (const t of before) {
        expect(t.value, `#${t.id} prefilled`).toBe("");
      }

      // Audit path: type a unique complaint in the HERO input and submit it.
      const unique = `right-side bedroom wall seepage-${Date.now()}-${Math.random().toString(36).slice(2)} landlord ignoring calls`;
      const hero = container.querySelector("#hero-input") as HTMLTextAreaElement;
      expect(hero).not.toBeNull();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
        setter.call(hero, unique);
        hero.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const form = hero.closest("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      // Intake view: the summary card carries the exact complaint…
      expect(container.textContent).toContain(unique);
      // …and no visible textarea carries sample or stale text.
      const during = textareas();
      for (const t of during) {
        expect(t.value.includes("₹25,000 phone"), `#${t.id} shows sample`).toBe(false);
      }

      await act(async () => { root.unmount(); });
      container.remove();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Fix #1 — intake textarea never carries stale text across questions", () => {
  it("typing for Q1 then moving to Q2 clears the input", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { LanguageProvider } = await import("@/context/LanguageContext");
    const { IntakeCard } = await import("@/features/intake/IntakeCard");
    const { INTAKE_QUESTIONS } = await import("@/data/intakeQuestions");
    const React = await import("react");

    const q1 = INTAKE_QUESTIONS.find((q) => q.key === "what_happened")!;
    const q2 = INTAKE_QUESTIONS.find((q) => q.key === "opposing_party")!;
    expect(q1.type).toBe("text");
    expect(q2.type).toBe("text");
    expect(q1.id).not.toBe(q2.id);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const submitted: unknown[] = [];
    const render = (q: typeof q1) =>
      root.render(
        React.createElement(LanguageProvider, null, React.createElement(IntakeCard, { question: q, onAnswer: (v: unknown) => submitted.push(v) }))
      );

    await act(async () => { render(q1); });
    const ta = () => container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta()).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(ta(), "stale answer from previous question");
      ta().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(ta().value).toBe("stale answer from previous question");

    // Move to the next question: the stale text must be gone.
    await act(async () => { render(q2); });
    expect(ta().value).toBe("");

    // And submitting now sends only the fresh answer.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(ta(), "Acme Traders");
      ta().dispatchEvent(new Event("input", { bubbles: true }));
    });
    const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Continue"))!;
    await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(submitted).toEqual(["Acme Traders"]);

    await act(async () => { root.unmount(); });
    container.remove();
  });
});

// ─── Medium: Hindi summary in the category-only flow ─────────────────────────

describe("Medium — legacy summary speaks the selected language", () => {
  it("Hindi summary uses Hindi labels and no English fragments", () => {
    let state = intakeEngine.start("c1", "consumer_complaint");
    state = intakeEngine.answer(state, "incident_date", "2026-08-10");
    state = intakeEngine.answer(state, "opposing_party", "Acme");
    const hi = intakeEngine.summarize(state, "hi");
    expect(hi).toContain("तारीख:");
    expect(hi).toContain("दूसरी पार्टी:");
    expect(hi).not.toContain("Date:");
    expect(hi).not.toContain("Other party:");
    const en = intakeEngine.summarize(state, "en");
    expect(en).toContain("Date:");
    expect(en).not.toContain("तारीख:");
  });
});
