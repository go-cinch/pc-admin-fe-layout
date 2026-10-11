import forge from './forge-adapter';
import 'node-forge/lib/sha256';

export interface ScreenLock { userId: number; salt: string; hash: string }

// A lock protects this app session's UI. It is not an authentication credential.
// Keep only its salted digest with this refresh session, never a plaintext password.
export function lockDigest(salt: string, password: string) {
  return forge.md.sha256.create().update(salt + password, 'utf8').digest().toHex();
}
