/**
 * Repository interfaces — in-memory now, Postgres/pgvector later.
 * No business logic here; storage only.
 */

import type { LegalSource, LegalProvision, ID } from "@/types/domain";

export interface ILegalSourceRepository {
  save(source: LegalSource): Promise<LegalSource>;
  getById(id: ID): Promise<LegalSource | null>;
  getBySourceUrl(url: string): Promise<LegalSource | null>;
  listAll(): Promise<LegalSource[]>;
  listProductionAllowed(): Promise<LegalSource[]>;
  deleteAll(): Promise<void>;
}

export interface ILegalProvisionRepository {
  save(provision: LegalProvision): Promise<LegalProvision>;
  saveMany(provisions: LegalProvision[]): Promise<LegalProvision[]>;
  getById(id: ID): Promise<LegalProvision | null>;
  getBySourceId(sourceId: ID): Promise<LegalProvision[]>;
  getBySection(sourceId: ID, sectionId: string): Promise<LegalProvision | null>;
  listAll(): Promise<LegalProvision[]>;
  searchByNormalizedText(queryNorm: string): Promise<LegalProvision[]>;
  deleteBySourceId(sourceId: ID): Promise<void>;
  deleteAll(): Promise<void>;
}

// ─── In-memory implementations ─────────────────────────────────────────────

export class InMemoryLegalSourceRepository implements ILegalSourceRepository {
  private map = new Map<ID, LegalSource>();

  async save(source: LegalSource): Promise<LegalSource> {
    this.map.set(source.id, source);
    return source;
  }
  async getById(id: ID): Promise<LegalSource | null> {
    return this.map.get(id) ?? null;
  }
  async getBySourceUrl(url: string): Promise<LegalSource | null> {
    for (const s of this.map.values()) if (s.sourceUrl === url || s.url === url) return s;
    return null;
  }
  async listAll(): Promise<LegalSource[]> {
    return Array.from(this.map.values());
  }
  async listProductionAllowed(): Promise<LegalSource[]> {
    return Array.from(this.map.values()).filter((s) => s.productionAllowed === true && s.verified && !s.isMock);
  }
  async deleteAll(): Promise<void> {
    this.map.clear();
  }
}

export class InMemoryLegalProvisionRepository implements ILegalProvisionRepository {
  private map = new Map<ID, LegalProvision>();

  async save(provision: LegalProvision): Promise<LegalProvision> {
    this.map.set(provision.id, provision);
    return provision;
  }
  async saveMany(provisions: LegalProvision[]): Promise<LegalProvision[]> {
    provisions.forEach((p) => this.map.set(p.id, p));
    return provisions;
  }
  async getById(id: ID): Promise<LegalProvision | null> {
    return this.map.get(id) ?? null;
  }
  async getBySourceId(sourceId: ID): Promise<LegalProvision[]> {
    return Array.from(this.map.values()).filter((p) => p.sourceId === sourceId);
  }
  async getBySection(sourceId: ID, sectionId: string): Promise<LegalProvision | null> {
    const norm = sectionId.trim().toLowerCase();
    for (const p of this.map.values()) {
      if (p.sourceId === sourceId && p.sectionIdentifier.trim().toLowerCase() === norm) return p;
    }
    return null;
  }
  async listAll(): Promise<LegalProvision[]> {
    return Array.from(this.map.values());
  }
  async searchByNormalizedText(queryNorm: string): Promise<LegalProvision[]> {
    const q = queryNorm.toLowerCase();
    return Array.from(this.map.values()).filter((p) => p.normalizedText.includes(q));
  }
  async deleteBySourceId(sourceId: ID): Promise<void> {
    for (const [k, v] of this.map) if (v.sourceId === sourceId) this.map.delete(k);
  }
  async deleteAll(): Promise<void> {
    this.map.clear();
  }
}

// Singletons for app — later injected via DI / server
export const legalSourceRepo: ILegalSourceRepository = new InMemoryLegalSourceRepository();
export const legalProvisionRepo: ILegalProvisionRepository = new InMemoryLegalProvisionRepository();
