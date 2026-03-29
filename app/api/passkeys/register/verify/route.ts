import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { prisma } from "@/lib/db";
import { cleanupPasskeyTables } from "@/lib/passkeyDb";
import { challengeFromClientDataJSON } from "@/lib/webauthnChallenge";
import { getWebAuthnConfig } from "@/lib/webauthnConfig";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  await cleanupPasskeyTables();

  let body: { response?: RegistrationResponseJSON };
  try {
    body = (await request.json()) as { response?: RegistrationResponseJSON };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reg = body.response;
  if (!reg?.response?.clientDataJSON) {
    return NextResponse.json({ error: "Missing registration response" }, { status: 400 });
  }

  const ch = challengeFromClientDataJSON(reg.response.clientDataJSON);
  if (!ch) {
    return NextResponse.json({ error: "Invalid client data" }, { status: 400 });
  }

  const row = await prisma.passkeyChallenge.findUnique({ where: { challenge: ch } });
  if (!row || row.kind !== "registration" || row.expiresAt < new Date()) {
    return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
  }

  let payload: { userId: string };
  try {
    payload = JSON.parse(row.payload) as { userId: string };
  } catch {
    return NextResponse.json({ error: "Invalid challenge payload" }, { status: 400 });
  }

  if (payload.userId !== gate.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { origins, rpID } = getWebAuthnConfig();

  const verification = await verifyRegistrationResponse({
    response: reg,
    expectedChallenge: row.challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    await prisma.passkeyChallenge.delete({ where: { id: row.id } }).catch(() => {});
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
  const credentialIdB64 = Buffer.from(credentialID).toString("base64url");
  const publicKeyB64 = Buffer.from(credentialPublicKey).toString("base64url");

  const transports = reg.response.transports;

  await prisma.passkeyCredential.create({
    data: {
      userId: gate.userId,
      credentialId: credentialIdB64,
      publicKey: publicKeyB64,
      counter,
      transports: transports?.length ? JSON.stringify(transports) : null,
    },
  });

  await prisma.passkeyChallenge.delete({ where: { id: row.id } });

  return NextResponse.json({ ok: true });
}
