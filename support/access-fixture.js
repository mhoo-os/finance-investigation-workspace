const teamDomain = 'mhoo-test.cloudflareaccess.com';
const audience = 'synthetic-staging-audience';
const now = Math.floor(Date.now() / 1000);

const fixture = crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
).then(async (keyPair) => ({
  keyPair,
  jwk: { ...await crypto.subtle.exportKey('jwk', keyPair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' },
}));

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export const accessVerificationEnvironment = (overrides = {}) => ({
  DEPLOYMENT_ENV: 'staging',
  ACCESS_TEAM_DOMAIN: teamDomain,
  ACCESS_AUD: audience,
  ...overrides,
});

export async function accessAssertion({ header = {}, payload = {}, signingKey } = {}) {
  const { keyPair } = await fixture;
  const encodedHeader = encode({ alg: 'RS256', kid: 'test-key', ...header });
  const encodedPayload = encode({
    iss: `https://${teamDomain}`,
    aud: audience,
    sub: 'synthetic-investigator',
    email: 'investigator@example.test',
    exp: now + 300,
    nbf: now - 300,
    ...payload,
  });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey ?? keyPair.privateKey, new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  return `${encodedHeader}.${encodedPayload}.${Buffer.from(signature).toString('base64url')}`;
}

export async function accessRequest(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('cf-access-jwt-assertion', await accessAssertion());
  return new Request(url, { ...init, headers });
}

export async function accessCertificatesResponse({ body, headers, status = 200 } = {}) {
  const { jwk } = await fixture;
  return new Response(body ?? JSON.stringify({ keys: [jwk] }), { status, headers });
}

export async function withAccessCertificates(operation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => accessCertificatesResponse();
  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export const accessNow = () => now;
