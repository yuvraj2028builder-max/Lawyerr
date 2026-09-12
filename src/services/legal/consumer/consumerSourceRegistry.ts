/**
 * Consumer Production Corpus Registry — single source of truth for which
 * sources are allowed in production for domain=consumer_grievance.
 *
 * Production retrieval fails closed: productionAllowed !== true → cannot support verified claim.
 *
 * Sources are Tiered:
 *  Tier1 PRIMARY_OFFICIAL — legislation/rules from indiacode/egazette
 *  Tier2   — official judicial/commission
 *  Tier3   — official procedure (consumeraffairs, NCH, e-Jagriti) — labelled official_procedure, not legal_provision
 */

import type { ProductionCorpusEntry } from "@/types/domain";

export const CONSUMER_PRODUCTION_REGISTRY: ProductionCorpusEntry[] = [
  {
    sourceId: "cpa_2019_india_code",
    domain: "consumer_grievance",
    authorityLevel: "CENTRAL_GOVT",
    sourceType: "PRIMARY_OFFICIAL",
    productionAllowed: true,
    verificationStatus: "VERIFIED",
    version: "2019-08-09",
    effectiveFrom: "2020-07-20",
    lastVerifiedAt: "2026-09-01",
  },
  {
    sourceId: "consumer_ecommerce_rules_2020",
    domain: "consumer_grievance",
    authorityLevel: "CENTRAL_GOVT",
    sourceType: "PRIMARY_OFFICIAL",
    productionAllowed: true,
    verificationStatus: "VERIFIED",
    version: "2020-07-23",
    effectiveFrom: "2020-07-23",
    lastVerifiedAt: "2026-09-01",
  },
  {
    sourceId: "consumer_direct_selling_rules_2021",
    domain: "consumer_grievance",
    authorityLevel: "CENTRAL_GOVT",
    sourceType: "PRIMARY_OFFICIAL",
    productionAllowed: true,
    verificationStatus: "VERIFIED",
    version: "2021-12-28",
    effectiveFrom: "2021-12-28",
    lastVerifiedAt: "2026-09-01",
  },
  {
    sourceId: "dept_consumer_affairs_procedures",
    domain: "consumer_grievance",
    authorityLevel: "CENTRAL_GOVT",
    sourceType: "SECONDARY_AUTHORITATIVE",
    productionAllowed: true,
    verificationStatus: "VERIFIED",
    lastVerifiedAt: "2026-09-01",
  },
  {
    sourceId: "nch_ccpa_ejagriti_procedures",
    domain: "consumer_grievance",
    authorityLevel: "CENTRAL_GOVT",
    sourceType: "SECONDARY_AUTHORITATIVE",
    productionAllowed: true,
    verificationStatus: "VERIFIED",
    lastVerifiedAt: "2026-09-01",
  },
  {
    sourceId: "ncdrc_commission_procedures",
    domain: "consumer_grievance",
    authorityLevel: "JUDICIARY",
    sourceType: "SECONDARY_AUTHORITATIVE",
    productionAllowed: false,
    verificationStatus: "PENDING",
  },
];

/** Official URLs — used for citation generation when verified, not invented */
export const CONSUMER_SOURCE_URLS: Record<string, string> = {
  cpa_2019_india_code: "https://www.indiacode.nic.in/handle/123456789/15256?sam_handle=123456789/1362",
  consumer_ecommerce_rules_2020: "https://consumeraffairs.nic.in/sites/default/files/file-uploads/e-commerce-rules.pdf",
  consumer_direct_selling_rules_2021: "https://consumeraffairs.nic.in/sites/default/files/file-uploads/direct-selling-rules.pdf",
  dept_consumer_affairs_procedures: "https://consumeraffairs.nic.in/",
  nch_ccpa_ejagriti_procedures: "https://consumerhelpline.gov.in/ and https://e-jagriti.gov.in/",
  ncdrc_commission_procedures: "https://ncdrc.nic.in/",
};

export function isProductionAllowed(sourceId: string): boolean {
  const entry = CONSUMER_PRODUCTION_REGISTRY.find((e) => e.sourceId === sourceId);
  return entry ? entry.productionAllowed === true && entry.verificationStatus === "VERIFIED" : false;
}

export function getRegistryEntry(sourceId: string): ProductionCorpusEntry | undefined {
  return CONSUMER_PRODUCTION_REGISTRY.find((e) => e.sourceId === sourceId);
}

export function listProductionAllowedIds(): string[] {
  return CONSUMER_PRODUCTION_REGISTRY.filter((e) => e.productionAllowed && e.verificationStatus === "VERIFIED").map((e) => e.sourceId);
}
