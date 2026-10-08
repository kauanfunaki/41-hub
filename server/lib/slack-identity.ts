import { createRemoteJWKSet, jwtVerify } from "jose";

const slackKeys = createRemoteJWKSet(new URL("https://slack.com/openid/connect/keys"));

export class SlackIdentityError extends Error {
  constructor(public readonly reason: "wrong_workspace" | "invalid_identity") {
    super(reason);
  }
}

export async function verifySlackIdentity(
  idToken: string,
  expected: { nonce: string; clientId: string; teamId: string },
  keys: Parameters<typeof jwtVerify>[1] = slackKeys,
): Promise<{ userId: string; teamId: string }> {
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ["RS256"],
    issuer: "https://slack.com",
    audience: expected.clientId,
    requiredClaims: ["sub", "exp", "iat", "nonce"],
  });
  const teamId = payload["https://slack.com/team_id"];
  if (payload.nonce !== expected.nonce || typeof payload.sub !== "string" || !/^[UW][A-Z0-9]+$/.test(payload.sub)) {
    throw new SlackIdentityError("invalid_identity");
  }
  if (teamId !== expected.teamId) throw new SlackIdentityError("wrong_workspace");
  return { userId: payload.sub, teamId: expected.teamId };
}
