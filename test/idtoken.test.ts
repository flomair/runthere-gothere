import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { verifyFirebaseIdToken } from '../server/idtoken';

const PROJECT = 'run-there-go-threre';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const now = Math.floor(Date.now() / 1000);
  const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: number } = {}) =>
    new SignJWT({ email: 'owner@example.com', email_verified: true, name: 'Flo', auth_time: now - 60, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(opts.aud ?? PROJECT)
      .setSubject('uid-123')
      .setIssuedAt(now - 60)
      .setExpirationTime(opts.exp ?? now + 3600)
      .sign(privateKey);
  return { keys, sign, now };
}

describe('Firebase ID token verification', () => {
  it('accepts a valid token and maps the claims', async () => {
    const { keys, sign } = await setup();
    expect(await verifyFirebaseIdToken(await sign({}), PROJECT, keys)).toEqual({
      uid: 'uid-123',
      email: 'owner@example.com',
      emailVerified: true,
      name: 'Flo',
      picture: undefined,
    });
  });

  it('rejects wrong project, wrong issuer, expired and forged tokens', async () => {
    const { keys, sign, now } = await setup();
    await expect(verifyFirebaseIdToken(await sign({}, { aud: 'other-project' }), PROJECT, keys)).rejects.toThrow();
    await expect(verifyFirebaseIdToken(await sign({}, { iss: 'https://evil.example' }), PROJECT, keys)).rejects.toThrow();
    await expect(verifyFirebaseIdToken(await sign({}, { exp: now - 600 }), PROJECT, keys)).rejects.toThrow();
    await expect(verifyFirebaseIdToken(await sign({ auth_time: now + 3600 }), PROJECT, keys)).rejects.toThrow(/auth_time/);

    const other = await setup(); // signed with a different private key but same kid
    await expect(verifyFirebaseIdToken(await other.sign({}), PROJECT, keys)).rejects.toThrow();
  });
});
