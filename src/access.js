const MAX_JWKS_BYTES = 256 * 1024;

const json = (value, status) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

function decodeBase64Url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return bytes;
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(value)));
}

function assertionFrom(request) {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header) return header;
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'CF_Authorization') return value.join('=');
  }
  return null;
}

function expectedIssuer(teamDomain) {
  const hostname = teamDomain.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) || !hostname.endsWith('.cloudflareaccess.com')) {
    throw new Error('Access team domain is invalid');
  }
  return `https://${hostname}`;
}

async function loadJwk(issuer, kid, fetcher) {
  const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Access certificate lookup failed');
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_JWKS_BYTES) throw new Error('Access certificate response is too large');
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_JWKS_BYTES) throw new Error('Access certificate response is too large');
  const jwks = JSON.parse(body);
  const key = jwks.keys?.find((candidate) => candidate.kid === kid && candidate.kty === 'RSA');
  if (!key) throw new Error('Access signing key was not found');
  return key;
}

function validateClaims(payload, issuer, audience, now) {
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== issuer || !audiences.includes(audience)) throw new Error('Access token scope is invalid');
  if (!Number.isInteger(payload.exp) || payload.exp <= now) throw new Error('Access token is expired');
  if (payload.nbf !== undefined && (!Number.isInteger(payload.nbf) || payload.nbf > now)) throw new Error('Access token is not active');
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new Error('Access token subject is missing');
}

export async function verifyAccessAssertion(request, env, { fetcher = fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (env.DEPLOYMENT_ENV !== 'staging' || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new Error('Access enforcement is not configured for staging');
  }
  const token = assertionFrom(request);
  if (!token) throw new Error('Access assertion is missing');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Access assertion is malformed');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson(encodedHeader);
  const payload = decodeJson(encodedPayload);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Access signing algorithm is invalid');
  const issuer = expectedIssuer(env.ACCESS_TEAM_DOMAIN);
  validateClaims(payload, issuer, env.ACCESS_AUD, now());
  const jwk = await loadJwk(issuer, header.kid, fetcher);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error('Access signature is invalid');
  return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}

export function accessDenied() {
  return json({ error: 'Cloudflare Access authentication is required.' }, 401);
}

export function accessMisconfigured() {
  return json({ error: 'Staging access protection is unavailable.' }, 503);
}
