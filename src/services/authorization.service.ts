/** Provider-independent authorization contract. Backend/database enforcement is required. */
import type { ID } from "@/types/domain";

export type AuthorizationAction = "read_case" | "read_document" | "upload_document" | "delete_document" | "update_case_facts" | "export_draft";
export interface AuthorizationService {
  can(userId: ID | null, action: AuthorizationAction, resource: { caseId: ID; documentId?: ID; ownerId?: ID }): Promise<boolean>;
  canReadCase(userId: ID | null, caseId: ID, ownerId?: ID): Promise<boolean>;
  canReadDocument(userId: ID | null, caseId: ID, documentId: ID, ownerId?: ID): Promise<boolean>;
}

/** Fails closed: a frontend-only check never authorizes access to private data. */
export class BackendRequiredAuthorizationService implements AuthorizationService {
  async can(_userId: ID | null, _action: AuthorizationAction, _resource: { caseId: ID; documentId?: ID; ownerId?: ID }): Promise<boolean> { return false; }
  async canReadCase(userId: ID | null, caseId: ID, ownerId?: ID): Promise<boolean> { return this.can(userId, "read_case", { caseId, ownerId }); }
  async canReadDocument(userId: ID | null, caseId: ID, documentId: ID, ownerId?: ID): Promise<boolean> { return this.can(userId, "read_document", { caseId, documentId, ownerId }); }
}

export const authorizationService: AuthorizationService = new BackendRequiredAuthorizationService();
export const FRONTEND_AUTHORIZATION_LIMITATION = "Frontend authorization checks are UX hints only. A backend and database policy must enforce ownership for every request.";
