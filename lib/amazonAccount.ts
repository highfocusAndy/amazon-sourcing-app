import {
  buildSpApiConfigFromEnvAndAccount,
  getSpApiClient,
  SpApiClient,
  tryReadSpApiConfig,
} from "@/lib/spApiClient";
import { prisma } from "@/lib/db";
import { decryptAmazonRefreshToken } from "@/lib/amazonTokenCrypto";
import { getOAuthAuthSecret } from "@/lib/amazonOAuth";

export const SP_API_UNAVAILABLE_USER_MESSAGE =
  "Amazon SP-API is not available. Connect your seller account in settings (Connect Amazon) or set SP_API_* and AWS credentials in the server environment.";

function readAwsEnvSlice():
  | {
      awsAccessKeyId: string;
      awsSecretAccessKey: string;
      awsRegion: string;
      spApiHost: string | null;
      awsRoleArn?: string | null;
      awsRoleSessionName?: string | null;
    }
  | null {
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!awsAccessKeyId || !awsSecretAccessKey) return null;
  const awsRegion = process.env.AWS_REGION?.trim() || "us-east-1";
  return {
    awsAccessKeyId,
    awsSecretAccessKey,
    awsRegion,
    spApiHost: process.env.SP_API_HOST?.trim() || null,
    awsRoleArn: process.env.AWS_ROLE_ARN?.trim() || null,
    awsRoleSessionName: process.env.AWS_ROLE_SESSION_NAME?.trim() || null,
  };
}

async function getUserMarketplaceId(userId: string): Promise<string | null> {
  try {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { marketplaceId: true },
    });
    return prefs?.marketplaceId?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * SP-API client using this user's OAuth refresh token + seller id (app LWA client + AWS keys from env).
 */
export async function tryCreateSpApiClientForOAuthUser(userId: string): Promise<SpApiClient | null> {
  const authSecret = getOAuthAuthSecret();
  if (!authSecret) return null;

  const account = await prisma.amazonAccount.findUnique({
    where: { userId },
    select: {
      spRefreshTokenEnc: true,
      sellerId: true,
      oauthMarketplaceId: true,
    },
  });
  if (!account?.spRefreshTokenEnc || !account.sellerId?.trim()) return null;

  const refreshToken = decryptAmazonRefreshToken(account.spRefreshTokenEnc, authSecret);
  if (!refreshToken) return null;

  const aws = readAwsEnvSlice();
  if (!aws) return null;

  const mpPref = await getUserMarketplaceId(userId);
  const marketplaceId =
    mpPref ||
    account.oauthMarketplaceId?.trim() ||
    process.env.MARKETPLACE_ID?.trim() ||
    process.env.SP_API_MARKETPLACE_ID?.trim() ||
    null;
  if (!marketplaceId) return null;

  const cfg = buildSpApiConfigFromEnvAndAccount({
    refreshToken,
    sellerId: account.sellerId.trim(),
    marketplaceId,
    ...aws,
  });
  if (!cfg) return null;
  return new SpApiClient(cfg);
}

/** Fetches store display name from SP-API and persists it on the user's AmazonAccount row. */
export async function refreshAmazonStoreNameForUser(userId: string): Promise<string | null> {
  const client = await tryCreateSpApiClientForOAuthUser(userId);
  if (!client) return null;
  let preferred: string | null = null;
  try {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { marketplaceId: true },
    });
    preferred = prefs?.marketplaceId?.trim() || null;
  } catch {
    preferred = null;
  }
  try {
    const name = await client.fetchSellerStoreDisplayName(preferred);
    const trimmed = name?.trim();
    if (!trimmed) return null;
    await prisma.amazonAccount.update({
      where: { userId },
      data: { amazonStoreName: trimmed },
    });
    return trimmed;
  } catch (e) {
    console.error("refreshAmazonStoreNameForUser:", e);
    return null;
  }
}

/**
 * Returns an SP-API client. When the user is signed in and has completed Amazon OAuth, uses that seller;
 * otherwise uses app-level env credentials (SP_API_REFRESH_TOKEN + SELLER_ID) with optional marketplace override.
 */
export async function getSpApiClientForUserOrGlobal(
  userId: string | undefined,
): Promise<SpApiClient | null> {
  if (userId) {
    const oauthClient = await tryCreateSpApiClientForOAuthUser(userId);
    if (oauthClient) return oauthClient;
  }

  let marketplaceIdOverride: string | null = null;
  if (userId) {
    const mp = await getUserMarketplaceId(userId);
    if (mp) marketplaceIdOverride = mp;
  }

  const cfg = tryReadSpApiConfig(marketplaceIdOverride);
  if (!cfg) return null;
  return getSpApiClient(marketplaceIdOverride);
}

/** SP-API client for this user when they have completed Amazon OAuth (same as tryCreateSpApiClientForOAuthUser). */
export async function getSpApiClientForUser(userId: string): Promise<SpApiClient | null> {
  return tryCreateSpApiClientForOAuthUser(userId);
}
