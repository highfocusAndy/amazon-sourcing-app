import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { prisma } from "@/lib/db";
import { cleanupPasskeyTables, challengeExpiry } from "@/lib/passkeyDb";
import { getWebAuthnConfig } from "@/lib/webauthnConfig";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture, PublicKeyCredentialDescriptorFuture } from "@simplewebauthn/types";
import { NextResponse } from "next/server";

export async function POST() {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  await cleanupPasskeyTables();

  const user = await prisma.user.findUnique({ where: { id: gate.userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await prisma.passkeyCredential.findMany({ where: { userId: user.id } });
  const { rpID, rpName } = getWebAuthnConfig();

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      type: "public-key" as const,
      transports: c.transports
        ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
        : undefined,
    })) as unknown as PublicKeyCredentialDescriptorFuture[],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await prisma.passkeyChallenge.create({
    data: {
      challenge: options.challenge,
      kind: "registration",
      payload: JSON.stringify({ userId: user.id }),
      expiresAt: challengeExpiry(),
    },
  });

  return NextResponse.json(options);
}
