import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import { prisma } from "@/lib/db";

export function isBillingDisabled(): boolean {
  const v = process.env.BILLING_DISABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** When true, every signed-in user passes billing (QA / demos). Turn off when you go live. */
export function isTestingBillingPass(): boolean {
  const v = process.env.TESTING_BILLING_PASS?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * When true, paid Stripe checkout is disabled and users see a “testing phase” notice.
 * Promo codes and sign-in still work. Turn off when you are ready to sell.
 */
export function isSubscriptionsPaused(): boolean {
  const v = process.env.SUBSCRIPTIONS_PAUSED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function subscriptionsPausedMessage(): string {
  const custom = process.env.SUBSCRIPTIONS_PAUSED_MESSAGE?.trim();
  if (custom) return custom;
  return "We are in a testing phase and are not accepting paid subscriptions yet. Please do not complete payment. If you were invited to try the app, use Promo access with your code, or sign in if you already have an account.";
}

export function defaultTrialDays(): number {
  const n = Number(process.env.SUBSCRIPTION_TRIAL_DAYS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 14;
}

export function trialEndDateForNewUser(): Date {
  return new Date(Date.now() + defaultTrialDays() * 86_400_000);
}

/** Users who only get access after payment or promo — no free signup trial window. */
export function noSignupTrialEndsAt(): Date {
  return new Date(0);
}

function effectiveTrialEnd(user: {
  trialEndsAt: Date | null;
  createdAt: Date;
}): Date {
  const t = user.trialEndsAt;
  // `noSignupTrialEndsAt()` is epoch — do not treat as "missing" and grant createdAt-based trial.
  if (t) {
    const ms = t.getTime();
    if (!Number.isFinite(ms)) return new Date(user.createdAt.getTime() + defaultTrialDays() * 86_400_000);
    if (ms <= 0) return new Date(0);
    return t;
  }
  return new Date(user.createdAt.getTime() + defaultTrialDays() * 86_400_000);
}

/** Latest promo-backed access end: stored `promoAccessUntil` or, if stronger, per-redemption (heals null/short DB values). */
async function effectivePromoAccessEndMs(
  userId: string,
  promoAccessUntil: Date | null,
): Promise<number> {
  const stored = promoAccessUntil?.getTime() ?? 0;
  const rows = await prisma.promoRedemption.findMany({
    where: { userId },
    select: { redeemedAt: true, promoCode: { select: { grantsDays: true } } },
  });
  let fromRedemptions = 0;
  for (const r of rows) {
    const end = r.redeemedAt.getTime() + r.promoCode.grantsDays * 86_400_000;
    fromRedemptions = Math.max(fromRedemptions, end);
  }
  return Math.max(stored, fromRedemptions);
}

const billingUserSelect = {
  id: true,
  email: true,
  trialEndsAt: true,
  promoAccessUntil: true,
  subscriptionStatus: true,
  subscriptionPlan: true,
  createdAt: true,
  stripeCustomerId: true,
} as const;

export type BillingUser = {
  id: string;
  email: string;
  trialEndsAt: Date | null;
  promoAccessUntil: Date | null;
  subscriptionStatus: string;
  subscriptionPlan: string;
  createdAt: Date;
  stripeCustomerId: string | null;
};

/**
 * Resolves the DB row for access and billing UI. If the JWT `sub`/id no longer exists (e.g. DB reset),
 * falls back to the session email so invited users are not stuck on /subscribe until they sign out.
 */
export async function loadBillingUser(
  userId: string,
  emailFallback?: string | null,
): Promise<BillingUser | null> {
  const byId = await prisma.user.findUnique({
    where: { id: userId },
    select: billingUserSelect,
  });
  if (byId) return byId;
  const email = emailFallback?.trim().toLowerCase();
  if (!email) return null;
  return prisma.user.findUnique({
    where: { email },
    select: billingUserSelect,
  });
}

/** Access rules for an already-loaded user row (avoids duplicate DB hits in API routes). */
export async function billingUserHasAppAccess(
  user: BillingUser,
  /** When already computed (e.g. in getBillingOverview), skips a second promo redemption query. */
  promoEndMsPrecomputed?: number,
): Promise<boolean> {
  if (isAppOwnerEmail(user.email)) return true;
  const now = Date.now();
  if (now < effectiveTrialEnd(user).getTime()) return true;
  const promoEnd =
    promoEndMsPrecomputed ?? (await effectivePromoAccessEndMs(user.id, user.promoAccessUntil));
  if (promoEnd > 0 && now < promoEnd) return true;
  if (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") return true;
  return false;
}

export async function userHasAppAccess(userId: string, emailFallback?: string | null): Promise<boolean> {
  if (isBillingDisabled()) return true;
  if (isTestingBillingPass()) return true;

  const user = await loadBillingUser(userId, emailFallback);
  if (!user) return false;
  return billingUserHasAppAccess(user);
}

export type BillingOverview = {
  hasAccess: boolean;
  billingDisabled: boolean;
  /** True when TESTING_BILLING_PASS is on (everyone has access). */
  testingBillingPass: boolean;
  /** True when this user matches APP_OWNER_EMAIL (never expires). */
  appOwnerAccess: boolean;
  /**
   * Pro plan bulk upload (spreadsheet offers). AI features stay available on Starter for acquisition.
   * True for Pro subscription (incl. trialing Pro), active promo, owner, or billing test modes.
   */
  proBulkEntitled: boolean;
  trialEndsAt: string | null;
  promoAccessUntil: string | null;
  subscriptionStatus: string;
  subscriptionPlan: string;
  stripeConfigured: boolean;
  proPlanEnabled: boolean;
  hasStripeCustomer: boolean;
  /** Days remaining in signup trial (0 if ended). */
  trialDaysLeft: number;
  /** Days remaining from promo extension (0 if none). */
  promoDaysLeft: number;
  /**
   * Same value as SUBSCRIPTION_TRIAL_DAYS (default 14): signup trial length and Stripe subscription trial
   * after checkout (card on file; first charge when this period ends).
   */
  subscriptionTrialDays: number;
  /** Paid checkout disabled; show notice (SUBSCRIPTIONS_PAUSED). */
  subscriptionsPaused: boolean;
  subscriptionsPausedMessage: string;
};

function proBulkEntitlementsFromUserRow(
  user: BillingUser | null,
  opts: { billingDisabled: boolean; testingBillingPass: boolean; appOwnerAccess: boolean; promoEndMs: number; now: number },
): boolean {
  if (opts.billingDisabled || opts.testingBillingPass) return true;
  if (opts.appOwnerAccess) return true;
  if (!user) return false;
  if (isAppOwnerEmail(user.email)) return true;
  if (opts.promoEndMs > opts.now) return true;
  const paid = user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing";
  return paid && user.subscriptionPlan === "pro";
}

export async function getBillingOverview(userId: string, emailFallback?: string | null): Promise<BillingOverview> {
  const billingDisabled = isBillingDisabled();
  const testingBillingPass = isTestingBillingPass();
  const starterPriceId = process.env.STRIPE_PRICE_ID_STARTER?.trim() || process.env.STRIPE_PRICE_ID?.trim();
  const proPriceId = process.env.STRIPE_PRICE_ID_PRO?.trim();
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim() && starterPriceId);
  const proPlanEnabled = Boolean(process.env.STRIPE_SECRET_KEY?.trim() && proPriceId);
  const subscriptionTrialDays = defaultTrialDays();
  const subscriptionsPaused = isSubscriptionsPaused();
  const pausedMessage = subscriptionsPausedMessage();

  if (billingDisabled) {
    return {
      hasAccess: true,
      billingDisabled: true,
      testingBillingPass: false,
      appOwnerAccess: false,
      proBulkEntitled: true,
      trialEndsAt: null,
      promoAccessUntil: null,
      subscriptionStatus: "none",
      subscriptionPlan: "starter",
      stripeConfigured,
      proPlanEnabled,
      hasStripeCustomer: false,
      trialDaysLeft: 999,
      promoDaysLeft: 0,
      subscriptionTrialDays,
      subscriptionsPaused,
      subscriptionsPausedMessage: pausedMessage,
    };
  }

  if (testingBillingPass) {
    return {
      hasAccess: true,
      billingDisabled: false,
      testingBillingPass: true,
      appOwnerAccess: false,
      proBulkEntitled: true,
      trialEndsAt: null,
      promoAccessUntil: null,
      subscriptionStatus: "none",
      subscriptionPlan: "starter",
      stripeConfigured,
      proPlanEnabled,
      hasStripeCustomer: false,
      trialDaysLeft: 999,
      promoDaysLeft: 0,
      subscriptionTrialDays,
      subscriptionsPaused,
      subscriptionsPausedMessage: pausedMessage,
    };
  }

  const user = await loadBillingUser(userId, emailFallback);

  if (!user) {
    return {
      hasAccess: false,
      billingDisabled: false,
      testingBillingPass: false,
      appOwnerAccess: false,
      proBulkEntitled: false,
      trialEndsAt: null,
      promoAccessUntil: null,
      subscriptionStatus: "none",
      subscriptionPlan: "starter",
      stripeConfigured,
      proPlanEnabled,
      hasStripeCustomer: false,
      trialDaysLeft: 0,
      promoDaysLeft: 0,
      subscriptionTrialDays,
      subscriptionsPaused,
      subscriptionsPausedMessage: pausedMessage,
    };
  }

  const now = Date.now();
  if (isAppOwnerEmail(user.email)) {
    return {
      hasAccess: true,
      billingDisabled: false,
      testingBillingPass: false,
      appOwnerAccess: true,
      proBulkEntitled: true,
      trialEndsAt: null,
      promoAccessUntil: null,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionPlan: user.subscriptionPlan,
      stripeConfigured,
      proPlanEnabled,
      hasStripeCustomer: Boolean(user.stripeCustomerId),
      trialDaysLeft: 0,
      promoDaysLeft: 0,
      subscriptionTrialDays,
      subscriptionsPaused,
      subscriptionsPausedMessage: pausedMessage,
    };
  }

  const trialEnd = effectiveTrialEnd(user);
  const trialMsLeft = Math.max(0, trialEnd.getTime() - now);
  const trialDaysLeft = Math.ceil(trialMsLeft / 86_400_000);

  const promoEndMs = await effectivePromoAccessEndMs(user.id, user.promoAccessUntil);
  const promoDaysLeft =
    promoEndMs > now ? Math.ceil((promoEndMs - now) / 86_400_000) : 0;

  const hasAccess = await billingUserHasAppAccess(user, promoEndMs);

  const proBulkEntitled = proBulkEntitlementsFromUserRow(user, {
    billingDisabled: false,
    testingBillingPass: false,
    appOwnerAccess: false,
    promoEndMs,
    now,
  });

  return {
    hasAccess,
    billingDisabled: false,
    testingBillingPass: false,
    appOwnerAccess: false,
    proBulkEntitled,
    trialEndsAt: trialEnd.toISOString(),
    promoAccessUntil: user.promoAccessUntil?.toISOString() ?? null,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPlan: user.subscriptionPlan,
    stripeConfigured,
    proPlanEnabled,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    trialDaysLeft,
    promoDaysLeft,
    subscriptionTrialDays,
    subscriptionsPaused,
    subscriptionsPausedMessage: pausedMessage,
  };
}
