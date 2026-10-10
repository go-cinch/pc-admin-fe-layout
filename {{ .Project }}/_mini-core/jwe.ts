import forge from './forge-adapter';
import 'node-forge/lib/rsa';
import 'node-forge/lib/aes';
import 'node-forge/lib/sha256';
import type { Platform } from './platform';
export interface PublicJWK { kty: string; n: string; e: string }
const binary = (bytes: Uint8Array) => Array.from(bytes, n => String.fromCharCode(n)).join('');
const b64 = (value: string) => forge.util.encode64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (value: string) => forge.util.decode64(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
export async function encryptJWE(publicKey: PublicJWK, kid: string, typ: string, payload: unknown, random: Platform['random']): Promise<string> {
  if (publicKey.kty !== 'RSA' || !publicKey.n || !publicKey.e) throw new Error('Invalid RSA public key');
  const n = new forge.jsbn.BigInteger(forge.util.bytesToHex(decode(publicKey.n)), 16);
  if (n.bitLength() < 2048) throw new Error('RSA public key must be at least 2048 bits');
  const rsa = forge.pki.setRsaPublicKey(n, new forge.jsbn.BigInteger(forge.util.bytesToHex(decode(publicKey.e)), 16));
  const entropy = await random(76);
  if (entropy.byteLength !== 76) throw new Error('Invalid random byte count');
  const cek = binary(entropy.slice(0, 32)), iv = binary(entropy.slice(32, 44)), seed = binary(entropy.slice(44));
  const header = b64(forge.util.encodeUtf8(JSON.stringify({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid, typ })));
  const wrapped = rsa.encrypt(cek, 'RSA-OAEP', { md: forge.md.sha256.create(), mgf1: { md: forge.md.sha256.create() }, seed });
  const cipher = forge.cipher.createCipher('AES-GCM', cek);
  cipher.start({ iv, additionalData: header, tagLength: 128 });
  cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(JSON.stringify(payload))));
  if (!cipher.finish()) throw new Error('Credential encryption failed');
  return [header, b64(wrapped), b64(iv), b64(cipher.output.getBytes()), b64((cipher.mode as any).tag.getBytes())].join('.');
}
export async function randomID(random: Platform['random']) { return b64(binary(await random(18))) }
