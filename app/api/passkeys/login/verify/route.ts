import { prisma } from "@/lib/db";
import { cleanupPasskeyTables, loginTokenExpiry } from "@/lib/passkeyDb";
import { createPasskeyLoginSecret, hashPasskeyLoginSecret } from "@/lib/passkeyLoginToken";
import { challengeFromClientDataJSON } from "@/lib/webauthnChallenge";
import { getWebAuthnConfig } from "@/lib/webauthnConfig";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  await cleanupPasskeyTables();

  let body: { response?: AuthenticationResponseJSON };
  try {
    body = (await request.json()) as { response?: AuthenticationResponseJSON };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const authn = body.response;
  if (!authn?.response?.clientDataJSON || !authn.id) {
    return NextResponse.json({ error: "Missing authentication response" }, { status: 400 });
  }

  const ch = challengeFromClientDataJSON(authn.response.clientDataJSON);
  if (!ch) {
    return NextResponse.json({ error: "Invalid client data" }, { status: 400 });
  }

  const row = await prisma.passkeyChallenge.findUnique({ where: { challenge: ch } });
  if (!row || row.kind !== "authentication" || row.expiresAt < new Date()) {
    return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
  }

  let payload: { email: string };
  try {
    payload = JSON.parse(row.payload) as { email: string };
  } catch {
    return NextResponse.json({ error: "Invalid challenge payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!user) {
    await prisma.passkeyChallenge.delete({ where: { id: row.id } }).catch(() => {});
    return NextResponse.json({ error: "User not found" }, { status: 400 });
  }

  const cred = await prisma.passkeyCredential.findFirst({
    where: { userId: user.id, credentialId: authn.id },
  });
  if (!cred) {
    await prisma.passkeyChallenge.delete({ where: { id: row.id } }).catch(() => {});
    return NextResponse.json({ error: "Unknown credential" }, { status: 400 });
  }

  const { origins, rpID } = getWebAuthnConfig();

  const verification = await verifyAuthenticationResponse({
    response: authn,
    expectedChallenge: row.challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    authenticator: {
      credentialID: Buffer.from(cred.credentialId, "base64url"),
      credentialPublicKey: Buffer.from(cred.publicKey, "base64url"),
      counter: cred.counter,
    },
  });

  if (!verification.verified) {
    await prisma.passkeyChallenge.delete({ where: { id: row.id } }).catch(() => {});
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  await prisma.passkeyCredential.update({
    where: { id: cred.id },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  const secret = createPasskeyLoginSecret();
  await prisma.passkeyLoginToken.create({
    data: {
      tokenHash: hashPasskeyLoginSecret(secret),
      userId: user.id,
      expiresAt: loginTokenExpiry(),
    },
  });

  await prisma.passkeyChallenge.delete({ where: { id: row.id } });

  return NextResponse.json({ token: secret });
}
