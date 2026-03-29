import { prisma } from "@/lib/db";
import { cleanupPasskeyTables, challengeExpiry } from "@/lib/passkeyDb";
import { getWebAuthnConfig } from "@/lib/webauthnConfig";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture, PublicKeyCredentialDescriptorFuture } from "@simplewebauthn/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  await cleanupPasskeyTables();

  let email: string;
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "No account for this email." }, { status: 404 });
  }

  const creds = await prisma.passkeyCredential.findMany({ where: { userId: user.id } });
  if (creds.length === 0) {
    return NextResponse.json(
      {
        error:
          "No passkey on this account yet. Sign in with your password once, then add a passkey in Account settings.",
      },
      { status: 404 },
    );
  }

  const { rpID } = getWebAuthnConfig();

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      type: "public-key" as const,
      transports: c.transports
        ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
        : undefined,
    })) as unknown as PublicKeyCredentialDescriptorFuture[],
    userVerification: "preferred",
  });

  await prisma.passkeyChallenge.create({
    data: {
      challenge: options.challenge,
      kind: "authentication",
      payload: JSON.stringify({ email }),
      expiresAt: challengeExpiry(),
    },
  });

  return NextResponse.json(options);
}
