/**
 * EscalationEngine — determines when human help may be needed.
 * Levels are product states, NOT clinical/statistical scores.
 *
 * Considers: severity, deadlines, criminal/civil, amount, complexity, docs, uncertainty.
 */

import type { Case, EscalationAssessment, EscalationLevel } from "@/types/domain";
import { DEMO_DISCLAIMER } from "@/data/demoFixtures";

export interface IEscalationService {
  assess(kase: Case): Promise<EscalationAssessment>;
}

function levelFromSignals(kase: Case): { level: EscalationLevel; reasons: string[] } {
  const reasons: string[] = [];
  let level: EscalationLevel = "LOW";

  const desc = (kase.description || "").toLowerCase();
  const hasSummons = desc.includes("summons") || desc.includes("court") || desc.includes("arrest") || desc.includes("police") || desc.includes("fir");
  const hasDeadline = kase.deadlines.some((d) => d.urgency === "urgent" || d.urgency === "overdue");
  const hasLargeAmount = (kase.money?.amount ?? 0) > 100000;
  const hasLegalNotice = kase.problemCategory === "legal_notice" || desc.includes("notice");

  if (hasSummons) {
    level = "HIGH";
    reasons.push("Mentions court / summons / police — get human help quickly.");
  } else if (hasDeadline || hasLargeAmount) {
    level = "MEDIUM";
    if (hasDeadline) reasons.push("A deadline was mentioned — don't miss it.");
    if (hasLargeAmount) reasons.push("Large amount involved — consider talking to a lawyer or legal aid.");
  }

  if (hasLegalNotice && level === "LOW") {
    level = "MEDIUM";
    reasons.push("A legal notice usually has a reply window — check dates carefully.");
  }

  if (kase.analysis?.confidence === "unverified" || kase.analysis?.confidence === "low") {
    reasons.push("Our analysis is not yet verified against primary legal sources — treat as general information.");
  }

  if (reasons.length === 0) {
    reasons.push("No urgent court or deadline signals in what you shared.");
  }

  return { level, reasons };
}

class EscalationService implements IEscalationService {
  async assess(kase: Case): Promise<EscalationAssessment> {
    const { level, reasons } = levelFromSignals(kase);
    const base: EscalationAssessment = {
      id: `esc_${Math.random().toString(36).slice(2, 9)}`,
      caseId: kase.id,
      level,
      reasons,
      suggestedRoutes: [],
      disclaimer: DEMO_DISCLAIMER,
      assessedAt: new Date().toISOString(),
      isMock: true,
    };

    if (kase.problemCategory === "consumer_complaint") {
      base.suggestedRoutes = [
        { route: "government_authority", label: "National Consumer Helpline (NCH 1915)", description: "Pre-litigation grievance redressal via helpline or consumerhelpline.gov.in." },
        { route: "government_authority", label: "District Consumer Commission (e-Daakhil)", description: "File a formal consumer complaint online if seller refuses to resolve." },
        { route: "legal_aid_dlsa", label: "District Legal Services Authority (DLSA)", description: "Free legal assistance if eligible." },
      ];
    } else if (level === "LOW") {
      base.suggestedRoutes = [
        { route: "self_help", label: "Keep records + written request", description: "Often enough as a first step." },
        { route: "legal_aid_dlsa", label: "District Legal Services Authority (DLSA)", description: "Free legal aid if eligible — we can help you locate yours." },
      ];
    } else if (level === "MEDIUM") {
      base.suggestedRoutes = [
        { route: "legal_aid_dlsa", label: "Talk to DLSA / legal aid", description: "Good for deadlines and notices." },
        { route: "lawyer", label: "Consult a local lawyer", description: "For a quick document review." },
        { route: "mediation_lok_adalat", label: "Mediation / Lok Adalat", description: "May suit money recovery disputes." },
      ];
    } else {
      base.suggestedRoutes = [
        { route: "lawyer", label: "Talk to a lawyer urgently", description: "Court / police matters need prompt human advice." },
        { route: "legal_aid_dlsa", label: "Contact DLSA immediately", description: "If you cannot afford a lawyer." },
        { route: "emergency_services", label: "Emergency help if needed", description: "If there is any threat to safety, contact emergency services." },
      ];
    }

    return base;
  }
}

export const escalationService: IEscalationService = new EscalationService();
