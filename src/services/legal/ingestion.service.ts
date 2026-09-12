/**
 * LegalSourceIngestionService — Raw → Parse → Normalize → Validate → Chunk → Hash → Store → Index
 *
 * Does NOT scrape. Accepts structured input already vetted as PRIMARY_OFFICIAL
 * or TEST_FIXTURE. Hard boundary: productionAllowed=false for mock/test.
 */

import type { LegalSource, LegalProvision, ID } from "@/types/domain";
import type { ILegalSourceRepository, ILegalProvisionRepository } from "./repositories";
import { createContentHash } from "./hash";
import { normalizeText, normalizeSectionIdentifier, isSuspiciousSourceContent } from "./normalize";
import { legalSourceRepo, legalProvisionRepo } from "./repositories";

// ─── Input types ────────────────────────────────────────────────────────────

export interface RawLegalSourceInput {
  id?: ID;
  title: string;
  sourceType: "PRIMARY_OFFICIAL" | "SECONDARY_AUTHORITATIVE" | "SECONDARY" | "UNVERIFIED" | "TEST_FIXTURE";
  authority: string;
  authorityLevel?: LegalSource["authorityLevel"];
  jurisdiction: LegalSource["jurisdiction"];
  language?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  documentVersion?: string;
  sourceUrl?: string;
  tags?: string[];
  disclaimer?: string;
  domain?: LegalSource["domain"];
  provisionKind?: LegalSource["provisionKind"];
  // Content — structured by hierarchy
  actTitle?: string;
  sections: Array<{
    identifier: string; // e.g. "TEST-1" or "Section 2(7)"
    heading?: string;
    text: string;
    pageOrLocation?: string;
    chapter?: string;
    section?: string;
    subsection?: string;
    clause?: string;
  }>;
  // Trust — must be explicit for safety
  isMock: boolean;
  verified: boolean;
  productionAllowed: boolean;
  verificationStatus?: LegalSource["verificationStatus"];
}

export interface IngestionResult {
  source: LegalSource;
  provisions: LegalProvision[];
  warnings: string[];
}

// ─── Service ────────────────────────────────────────────────────────────────

export interface ILegalSourceIngestionService {
  ingestSource(input: RawLegalSourceInput): Promise<IngestionResult>;
  validateSource(source: LegalSource): { ok: boolean; errors: string[] };
  chunkSource(source: LegalSource, input: RawLegalSourceInput): LegalProvision[];
}

export class LegalSourceIngestionService implements ILegalSourceIngestionService {
  constructor(
    private sourceRepo: ILegalSourceRepository = legalSourceRepo,
    private provisionRepo: ILegalProvisionRepository = legalProvisionRepo
  ) {}

  validateSource(source: LegalSource): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!source.title?.trim()) errors.push("title is required");
    if (!source.authority?.trim()) errors.push("authority is required");
    if (!source.jurisdiction) errors.push("jurisdiction is required");
    if (!source.sourceType) errors.push("sourceType is required");
    // Hard boundary: test/mock cannot be productionAllowed
    if (source.isMock && source.productionAllowed) errors.push("isMock=true cannot have productionAllowed=true");
    if (source.sourceType === "TEST_FIXTURE" && source.productionAllowed) errors.push("TEST_FIXTURE cannot have productionAllowed=true");
    if (source.sourceType === "UNVERIFIED" && source.productionAllowed) errors.push("UNVERIFIED cannot have productionAllowed=true");
    if (source.verified && source.isMock) errors.push("verified=true cannot have isMock=true");
    if (source.productionAllowed && !source.verified) errors.push("productionAllowed=true requires verified=true");
    if (source.productionAllowed && source.isMock) errors.push("productionAllowed=true requires isMock=false");
    if (source.sourceUrl && !isValidUrl(source.sourceUrl)) errors.push("sourceUrl must be a valid http(s) URL if provided");
    return { ok: errors.length === 0, errors };
  }

  chunkSource(source: LegalSource, input: RawLegalSourceInput): LegalProvision[] {
    const provisions: LegalProvision[] = [];
    input.sections.forEach((sec, idx) => {
      const normalized = normalizeText(sec.text);
      const hash = createContentHash(normalized);
      const provision: LegalProvision = {
        id: `${source.id}__${normalizeSectionIdentifier(sec.identifier).replace(/\s+/g, "_")}__${idx}`,
        sourceId: source.id,
        sectionIdentifier: sec.identifier.trim(),
        heading: sec.heading,
        text: sec.text,
        normalizedText: normalized,
        chunkIndex: idx,
        pageOrLocation: sec.pageOrLocation,
        actTitle: input.actTitle ?? source.title,
        chapter: sec.chapter,
        section: sec.section,
        subsection: sec.subsection,
        clause: sec.clause,
        metadata: {
          authority: source.authority,
          sourceType: source.sourceType,
          jurisdiction: source.jurisdiction,
          documentVersion: source.documentVersion,
          domain: source.domain,
          provisionKind: source.provisionKind,
        },
        contentHash: hash,
        version: source.documentVersion,
        effectiveFrom: source.effectiveFrom,
        effectiveTo: source.effectiveTo,
        productionAllowed: source.productionAllowed === true,
        isMock: source.isMock,
        domain: source.domain,
        provisionKind: source.provisionKind,
      };
      provisions.push(provision);
    });
    return provisions;
  }

  async ingestSource(input: RawLegalSourceInput): Promise<IngestionResult> {
    const warnings: string[] = [];
    const now = new Date().toISOString();
    const id = input.id ?? `src_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;

    // Check suspicious content (prompt injection) — treat as DATA, warn but don't execute
    input.sections.forEach((s) => {
      if (isSuspiciousSourceContent(s.text)) {
        warnings.push(`Section ${s.identifier} contains suspicious instruction-like text — will be treated as DATA only.`);
      }
    });

    const normalizedTitle = normalizeText(input.title); // for hash base
    const source: LegalSource = {
      id,
      title: input.title,
      url: input.sourceUrl,
      sourceUrl: input.sourceUrl,
      jurisdiction: input.jurisdiction,
      type: mapSourceTypeToLegacyType(input.sourceType),
      citation: `${input.authority} — ${input.title}${input.documentVersion ? ` (v${input.documentVersion})` : ""}`,
      excerpt: input.sections[0]?.text.slice(0, 280),
      retrievedAt: now,
      confidence: input.verified ? "high" : "unverified",
      verified: input.verified,
      isMock: input.isMock,
      sourceType: input.sourceType,
      authority: input.authority,
      authorityLevel: input.authorityLevel ?? "UNKNOWN",
      language: (input.language as never) ?? "en",
      publicationDate: input.publicationDate,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      versionStatus: deriveVersionStatus(input.effectiveFrom, input.effectiveTo),
      documentVersion: input.documentVersion ?? "v1",
      contentHash: createContentHash(normalizedTitle + "|" + input.sections.map((s) => normalizeText(s.text)).join("|")),
      verificationStatus: input.verificationStatus ?? (input.verified ? "VERIFIED" : "PENDING"),
      productionAllowed: input.productionAllowed,
      disclaimer: input.disclaimer,
      tags: input.tags ?? [],
      domain: input.domain,
      provisionKind: input.provisionKind,
    };

    const validation = this.validateSource(source);
    if (!validation.ok) {
      throw new Error(`Source validation failed: ${validation.errors.join("; ")}`);
    }

    if (input.sections.length === 0) {
      throw new Error("Source must have at least one section/provision");
    }

    const provisions = this.chunkSource(source, input);

    // Store — atomic: delete old provisions for this source then save
    await this.provisionRepo.deleteBySourceId(source.id);
    await this.sourceRepo.save(source);
    await this.provisionRepo.saveMany(provisions);

    return { source, provisions, warnings };
  }
}

function deriveVersionStatus(effFrom?: string, effTo?: string): LegalSource["versionStatus"] {
  if (!effFrom && !effTo) return "unknown";
  const now = Date.now();
  if (effFrom && effTo) {
    const from = new Date(effFrom).getTime();
    const to = new Date(effTo).getTime();
    if (now < from) return "future";
    if (now > to) return "historical";
    return "current";
  }
  if (effFrom) {
    return new Date(effFrom).getTime() > now ? "future" : "current";
  }
  return "unknown";
}

function mapSourceTypeToLegacyType(st: RawLegalSourceInput["sourceType"]): LegalSource["type"] {
  switch (st) {
    case "PRIMARY_OFFICIAL":
      return "statute";
    case "SECONDARY_AUTHORITATIVE":
      return "government_portal";
    case "TEST_FIXTURE":
      return "other";
    default:
      return "other";
  }
}

function isValidUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const ingestionService = new LegalSourceIngestionService();
