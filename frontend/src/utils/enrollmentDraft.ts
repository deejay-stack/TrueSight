import type { AcademicSelection } from '../components/AcademicSelectors';
import type { PreparedFileUpload } from './documentPreview';
export type EnrollmentDraft = { code: string; academics: AcademicSelection; section: string; semester?: number; upload: PreparedFileUpload | null };
// Private local draft, scoped to the authenticated user; no public file URL or global draft key.
async function draftStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('truesight-enrollment-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function readEnrollmentDraft(userId: string): Promise<EnrollmentDraft | null> {
  const db = await draftStore();
  try { return await new Promise((resolve, reject) => { const r = db.transaction('drafts').objectStore('drafts').get(userId); r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error); }); }
  finally { db.close(); }
}
async function writeEnrollmentDraft(userId: string, draft: EnrollmentDraft) {
  const db = await draftStore();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').put(draft, userId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
const pendingWrites = new Map<string, Promise<void>>();
export async function saveEnrollmentDraft(userId: string, draft: EnrollmentDraft) {
  // Rapid field/semester changes must reach IndexedDB in the same order as the edits.
  const previous = pendingWrites.get(userId) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(() => writeEnrollmentDraft(userId,draft));
  pendingWrites.set(userId,pending);
  try { await pending; }
  finally { if (pendingWrites.get(userId) === pending) pendingWrites.delete(userId); }
}
