export type ProjectRole = "R5" | "R4" | "MEMBER";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}
export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
  joinedAt: string;
}
export interface ProjectRecord {
  id: string;
  name: string;
  mapId: string;
  state: unknown;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface RevisionRecord {
  id: string;
  projectId: string;
  revision: number;
  state: unknown;
  authorId: string;
  summary: string;
  createdAt: string;
  pinned?: boolean;
  label?: string;
}
export interface ShareRecord {
  id: string;
  projectId: string;
  planId: string;
  createdBy: string;
  createdAt: string;
  revokedAt?: string;
}
export interface Database {
  users: UserRecord[];
  sessions: SessionRecord[];
  projects: ProjectRecord[];
  members: ProjectMember[];
  revisions: RevisionRecord[];
  shares: ShareRecord[];
}
