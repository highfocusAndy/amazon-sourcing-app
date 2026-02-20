const DEFAULT_MARKETPLACE = "ATVPDKIKX0DER";
const DEFAULT_REGION = "us-east-1";
const DEFAULT_HOST = "sellingpartnerapi-na.amazon.com";
const DEFAULT_PROJECTED_MONTHLY_UNITS = 30;

export interface ServerEnv {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
  spApiRegion: string;
  spApiHost: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  awsRoleArn?: string;
  awsRoleSessionName: string;
  restrictedBrands: Set<string>;
  defaultProjectedMonthlyUnits: number;
}

function parseRestrictedBrands(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set<string>();
  }

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
}

function parseProjectedMonthlyUnits(raw: string | undefined): number {
  const parsed = Number(raw ?? DEFAULT_PROJECTED_MONTHLY_UNITS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PROJECTED_MONTHLY_UNITS;
  }
  return parsed;
}

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key} in .env.local`);
  }
  return value;
}

export function getServerEnv(): ServerEnv {
  return {
    clientId: requiredEnv("SP_API_CLIENT_ID"),
    clientSecret: requiredEnv("SP_API_CLIENT_SECRET"),
    refreshToken: requiredEnv("SP_API_REFRESH_TOKEN"),
    marketplaceId: process.env.SP_API_MARKETPLACE_ID?.trim() || DEFAULT_MARKETPLACE,
    spApiRegion: process.env.SP_API_REGION?.trim() || DEFAULT_REGION,
    spApiHost: process.env.SP_API_HOST?.trim() || DEFAULT_HOST,
    awsRegion: process.env.AWS_REGION?.trim() || DEFAULT_REGION,
    awsAccessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
    awsSecretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
    awsSessionToken: process.env.AWS_SESSION_TOKEN?.trim(),
    awsRoleArn: process.env.AWS_ROLE_ARN?.trim(),
    awsRoleSessionName: process.env.AWS_ROLE_SESSION_NAME?.trim() || "next-sp-api-session",
    restrictedBrands: parseRestrictedBrands(process.env.RESTRICTED_BRANDS),
    defaultProjectedMonthlyUnits: parseProjectedMonthlyUnits(process.env.PROJECTED_MONTHLY_UNITS),
  };
}
