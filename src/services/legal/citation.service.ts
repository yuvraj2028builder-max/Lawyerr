/**
 * Citation Engine — generates citations that always point to a real stored
 * source/provision. Never invents.
 */

import type { LegalSource, LegalProvision, ID } from "@/types/domain";
import type { ILegalSourceRepository, ILegalProvisionRepository } from "./repositories";
import { legalSourceRepo, legalProvisionRepo } from "./repositories";

export type CitationKind = "inline" | "footnote";

export interface Citation {
  id: ID;
  sourceId: ID;
  provisionId: ID;
  citationText: string; // human reference, e.g. "TEST ACT, Section TEST-1"
  citationUrl?: string;
  excerpt: string; // provision text snippet
  verified: boolean;
  productionAllowed: boolean;
  isMock: boolean;
  style: CitationKind;
}

export interface CitationInput {
  sourceId: ID;
  provisionId: ID;
  style?: CitationKind;
}

export interface ICitationService {
  createCitation(input: CitationInput): Promise<Citation>;
  formatCitation(source: LegalSource, provision: LegalProvision, style?: CitationKind): string;
}

export class CitationService implements ICitationService {
  constructor(
    private sourceRepo: ILegalSourceRepository = legalSourceRepo,
    private provisionRepo: ILegalProvisionRepository = legalProvisionRepo
  ) {}

  formatCitation(source: LegalSource, provision: LegalProvision, style: CitationKind = "inline"): string {
    const base = `${source.title} — ${provision.sectionIdentifier}${provision.heading ? ` (${provision.heading})` : ""}`;
    const version = source.documentVersion ? ` [v${source.documentVersion}]` : "";
    const urlPart = source.sourceUrl || source.url ? ` — ${source.sourceUrl || source.url}` : "";
    const prefix = source.isMock ? "[TEST FIXTURE — NOT LAW] " : "";
    if (style === "footnote") {
      return `${prefix}${base}${version}.${urlPart}`.trim();
    }
    return `${prefix}${base}${version}`.trim();
  }

  async createCitation(input: CitationInput): Promise<Citation> {
    const source = await this.sourceRepo.getById(input.sourceId);
    if (!source) throw new Error(`Citation failed: source ${input.sourceId} not found`);
    const provision = await this.provisionRepo.getById(input.provisionId);
    if (!provision) throw new Error(`Citation failed: provision ${input.provisionId} not found`);
    if (provision.sourceId !== source.id) throw new Error(`Citation failed: provision ${provision.id} does not belong to source ${source.id}`);

    const style = input.style ?? "inline";
    const citationText = this.formatCitation(source, provision, style);

    return {
      id: `cit_${source.id}_${provision.id}`,
      sourceId: source.id,
      provisionId: provision.id,
      citationText,
      citationUrl: source.sourceUrl || source.url,
      excerpt: provision.text.slice(0, 400),
      verified: source.verified && !source.isMock,
      productionAllowed: source.productionAllowed === true,
      isMock: source.isMock,
      style,
    };
  }
}

export const citationService = new CitationService();
