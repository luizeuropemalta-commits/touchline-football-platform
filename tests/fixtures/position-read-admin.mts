export let admin: unknown;
export function setAdmin(value: unknown) { admin = value; }
export function createAdminClient() { if (!admin) throw new Error('Missing synthetic admin'); return admin; }
