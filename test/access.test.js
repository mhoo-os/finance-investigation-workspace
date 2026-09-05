import assert from 'node:assert/strict';
import test from 'node:test';
import { accessDenied, accessMisconfigured, verifyAccessAssertion } from '../src/access.js';
import { accessAssertion, accessCertificatesResponse, accessNow, accessVerificationEnvironment } from '../support/access-fixture.js';

const verify = async (request, env = accessVerificationEnvironment(), fetcher = async () => accessCertificatesResponse()) => (
  verifyAccessAssertion(request, env, { fetcher, now: accessNow })
);

test('verifies a signed Access header with issuer, audience, lifetime, and subject', async () => {
  const request = new Request('https://example.test', { headers: { 'cf-access-jwt-assertion': await accessAssertion() } });
  assert.deepEqual(await verify(request), { subject: 'synthetic-investigator', email: 'investigator@example.test' });
});

test('accepts the Access cookie and an audience array', async () => {
  const assertion = await accessAssertion({ payload: { aud: ['other-audience', 'synthetic-staging-audience'], email: 7 } });
  const request = new Request('https://example.test', { headers: { cookie: `other=value; CF_Authorization=${assertion}` } });
  assert.deepEqual(await verify(request), { subject: 'synthetic-investigator', email: null });
});

test('fails closed when staging Access configuration or an assertion is missing', async () => {
  await assert.rejects(verify(new Request('https://example.test'), accessVerificationEnvironment({ ACCESS_AUD: '' })), /not configured/);
  await assert.rejects(verify(new Request('https://example.test')), /assertion is missing/);
});

test('rejects malformed tokens, unsafe algorithms, and invalid team domains', async () => {
  await assert.rejects(verify(new Request('https://example.test', { headers: { 'cf-access-jwt-assertion': 'not-a-jwt' } })), /malformed/);
  const invalidAlgorithm = await accessAssertion({ header: { alg: 'none' } });
  await assert.rejects(verify(new Request('https://example.test', { headers: { 'cf-access-jwt-assertion': invalidAlgorithm } })), /algorithm/);
  const assertion = await accessAssertion();
  await assert.rejects(verify(new Request('https://example.test', { headers: { 'cf-access-jwt-assertion': assertion } }), accessVerificationEnvironment({ ACCESS_TEAM_DOMAIN: 'https://unsafe.example' })), /domain is invalid/);
});

test('rejects tokens outside the configured issuer, audience, lifetime, or subject', async () => {
  for (const payload of [
    { iss: 'https://other.cloudflareaccess.com' },
    { aud: 'other-audience' },
    { exp: accessNow() },
    { exp: 'later' },
    { nbf: accessNow() + 1 },
    { nbf: 'later' },
    { sub: '' },
  ]) {
    const assertion = await accessAssertion({ payload });
    await assert.rejects(verify(new Request('https://example.test', { headers: { 'cf-access-jwt-assertion': assertion } })));
  }
});

test('rejects unavailable, oversized, missing, and invalid Access signing keys', async () => {
  const assertion = await accessAssertion();
  const request = () => new Request('https://example.test', { headers: { 'cf-access-jwt-assertion': assertion } });
  await assert.rejects(verify(request(), undefined, async () => new Response('no', { status: 503 })), /lookup failed/);
  await assert.rejects(verify(request(), undefined, async () => accessCertificatesResponse({ headers: { 'content-length': String(256 * 1024 + 1) } })), /too large/);
  await assert.rejects(verify(request(), undefined, async () => accessCertificatesResponse({ body: ' '.repeat(256 * 1024 + 1) })), /too large/);
  await assert.rejects(verify(request(), undefined, async () => new Response(JSON.stringify({ keys: [] }))), /not found/);

  const otherKey = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const invalidSignature = await accessAssertion({ signingKey: otherKey.privateKey });
  await assert.rejects(verify(new Request('https://example.test', { headers: { 'cf-access-jwt-assertion': invalidSignature } })), /signature is invalid/);
});

test('authentication failure responses are generic and non-cacheable', async () => {
  for (const [response, status] of [[accessDenied(), 401], [accessMisconfigured(), 503]]) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  }
});
