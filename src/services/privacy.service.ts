/**
 * Privacy Architecture — minimal retention, consent, deletion.
 * Never require Aadhaar, passwords, bank credentials.
 */

export interface ConsentRecord {
  userId: string;
  givenAt: string;
  version: string;
  language: "en" | "hi";
}

export interface IPrivacyService {
  // Consent
  recordConsent(userId: string, language: "en" | "hi"): ConsentRecord;
  hasConsent(userId: string): boolean;
  revokeConsent(userId: string): void;

  // Data minimization hints (for components to use)
  forbiddenFields(): string[];
  validateNoSensitiveData(input: Record<string, unknown>): { ok: boolean; flaggedKeys: string[] };

  // Deletion
  requestDeletion(userId: string, caseId?: string): Promise<{ caseId?: string; deletedAt: string }>;
}

const SENSITIVE_KEYS = new Set([
  "aadhaar",
  "aadhar",
  "pan",
  "password",
  "otp",
  "cvv",
  "cardNumber",
  "card_number",
  "bankPassword",
  "netbanking",
  "upiPin",
  "upi_pin",
]);

class PrivacyService implements IPrivacyService {
  private consentKey = (uid: string) => `nyayasetu_consent_${uid}`;

  recordConsent(userId: string, language: "en" | "hi"): ConsentRecord {
    const rec: ConsentRecord = { userId, givenAt: new Date().toISOString(), version: "v1", language };
    localStorage.setItem(this.consentKey(userId), JSON.stringify(rec));
    return rec;
  }

  hasConsent(userId: string): boolean {
    return !!localStorage.getItem(this.consentKey(userId));
  }

  revokeConsent(userId: string): void {
    localStorage.removeItem(this.consentKey(userId));
  }

  forbiddenFields(): string[] {
    return Array.from(SENSITIVE_KEYS);
  }

  validateNoSensitiveData(input: Record<string, unknown>): { ok: boolean; flaggedKeys: string[] } {
    const flagged: string[] = [];
    for (const k of Object.keys(input)) {
      if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase())) flagged.push(k);
      const v = String(input[k] ?? "").toLowerCase();
      if (v.includes("aadhaar") || v.includes("cvv") || v.includes("upi pin")) flagged.push(k);
    }
    return { ok: flagged.length === 0, flaggedKeys: flagged };
  }

  async requestDeletion(_userId: string, caseId?: string): Promise<{ caseId?: string; deletedAt: string }> {
    // Foundation: local only. Real impl would call server to purge.
    if (caseId) {
      localStorage.removeItem(`nyayasetu_case_${caseId}`);
    }
    return { caseId, deletedAt: new Date().toISOString() };
  }
}

export const privacyService: IPrivacyService = new PrivacyService();
