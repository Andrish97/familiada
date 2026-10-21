// Pomocnik testów: prawdziwy podpis RS256 tokenu Cloudflare Access
// i atrapa JWKS (https://<zespół>/cdn-cgi/access/certs).
import { webcrypto } from 'node:crypto';

const subtle = globalThis.crypto?.subtle || webcrypto.subtle;

export const ACCESS_TEAM = 'familiada-test.cloudflareaccess.com';
export const ACCESS_AUD = 'aud-unit-test';
export const ACCESS_ENV = { CF_ACCESS_TEAM_DOMAIN: ACCESS_TEAM, CF_ACCESS_AUD: ACCESS_AUD };
export const CERTS_URL = `https://${ACCESS_TEAM}/cdn-cgi/access/certs`;

const KID = 'unit-kid';
const algo = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const pair = await subtle.generateKey(algo, true, ['sign', 'verify']);
const otherPair = await subtle.generateKey(algo, true, ['sign', 'verify']);
const publicJwk = await subtle.exportKey('jwk', pair.publicKey);

const b64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

export async function signAccessJwt(claims = {}, { header = {}, wrongKey = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = { alg: 'RS256', kid: KID, typ: 'JWT', ...header };
  const p = { iss: `https://${ACCESS_TEAM}`, aud: [ACCESS_AUD], email: 'admin@example.com', iat: now, nbf: now, exp: now + 600, ...claims };
  const data = `${enc(h)}.${enc(p)}`;
  const sig = await subtle.sign('RSASSA-PKCS1-v1_5', (wrongKey ? otherPair : pair).privateKey, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

export function jwksResponse() {
  return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] }), { headers: { 'content-type': 'application/json' } });
}

// Owija atrapę fetch: adres JWKS obsługuje sam, resztę przekazuje dalej.
export function withJwks(next = async () => { throw new Error('unexpected fetch'); }) {
  return async (url, init) => (String(url) === CERTS_URL ? jwksResponse() : next(url, init));
}
