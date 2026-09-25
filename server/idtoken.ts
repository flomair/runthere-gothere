import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies Firebase Authentication ID tokens without firebase-admin/auth (whose jwks-rsa
 * dependency fails to load on some Node runtimes). Follows Google's documented rules:
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let remoteKeys: JWTVerifyGetKey | null = null;
const googleKeys = () => (remoteKeys ??= createRemoteJWKSet(new URL(JWKS_URL)));

export interface IdTokenClaims {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  keys: JWTVerifyGetKey = googleKeys(),
): Promise<IdTokenClaims> {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    clockTolerance: 30,
  });
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new Error('invalid subject');
  const authTime = payload.auth_time;
  if (typeof authTime !== 'number' || authTime > Date.now() / 1000 + 30) throw new Error('invalid auth_time');
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}
