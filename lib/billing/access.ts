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
  if (user.trialEndsAt) return user.trialEndsAt;
  return new Date(user.createdAt.getTime() + defaultTrialDays() * 86_400_000);
}

export async function userHasAppAccess(userId: string): Promise<boolean> {
  if (isBillingDisabled()) return true;
  if (isTestingBillingPass()) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      trialEndsAt: true,
      promoAccessUntil: true,
      subscriptionStatus: true,
      createdAt: true,
    },
  });
  if (!user) return false;

  const now = Date.now();
  if (now < effectiveTrialEnd(user).getTime()) return true;
  if (user.promoAccessUntil && now < user.promoAccessUntil.getTime()) return true;
  if (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") return true;
  return false;
}

export type BillingOverview = {
  hasAccess: boolean;
  billingDisabled: boolean;
  /** True when TESTING_BILLING_PASS is on (everyone has access). */
  testingBillingPass: boolean;
  trialEndsAt: string | null;
  promoAccessUntil: string | null;
  subscriptionStatus: string;
  stripeConfigured: boolean;
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

export async function getBillingOverview(userId: string): Promise<BillingOverview> {
  const billingDisabled = isBillingDisabled();
  const testingBillingPass = isTestingBillingPass();
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim());
  const subscriptionTrialDays = defaultTrialDays();
  const subscriptionsPaused = isSubscriptionsPaused();
  const pausedMessage = subscriptionsPausedMessage();

  if (billingDisabled) {
    return {
      hasAccess: true,
      billingDisabled: true,
      testingBillingPass: false,
      trialEndsAt: null,
      promoAccessUntil: null,
      subscriptionStatus: "none",
      stripeConfigured,
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
      trialEndsAt: null,
      promoAccessUntil: null,
      subscriptionStatus: "none",
      stripeConfigured,
      hasStripeCustomer: false,
      trialDaysLeft: 999,
      promoDaysLeft: 0,
      subscriptionTrialDays,
      subscriptionsPaused,
      subscriptionsPausedMessage: pausedMessage,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      trialEndsAt: true,
      promoAccessUntil: true,
      subscriptionStatus: true,
      createdAt: true,
      stripeCustomerId: true,
    },
  });

  if (!user) {
    return {
      hasAccess: false,
      billingDisabled: false,
      testingBillingPass: false,
      trialEndsAt: null,
      promoAccessUntil: null,
      subscriptionStatus: "none",
      stripeConfigured,
      hasStripeCustomer: false,
      trialDaysLeft: 0,
      promoDaysLeft: 0,
      subscriptionTrialDays,
      subscriptionsPaused,
      subscriptionsPausedMessage: pausedMessage,
    };
  }

  const now = Date.now();
  const trialEnd = effectiveTrialEnd(user);
  const trialMsLeft = Math.max(0, trialEnd.getTime() - now);
  const trialDaysLeft = Math.ceil(trialMsLeft / 86_400_000);

  let promoDaysLeft = 0;
  if (user.promoAccessUntil && user.promoAccessUntil.getTime() > now) {
    promoDaysLeft = Math.ceil((user.promoAccessUntil.getTime() - now) / 86_400_000);
  }

  const hasAccess = await userHasAppAccess(userId);

  return {
    hasAccess,
    billingDisabled: false,
    testingBillingPass: false,
    trialEndsAt: trialEnd.toISOString(),
    promoAccessUntil: user.promoAccessUntil?.toISOString() ?? null,
    subscriptionStatus: user.subscriptionStatus,
    stripeConfigured,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    trialDaysLeft,
    promoDaysLeft,
    subscriptionTrialDays,
    subscriptionsPaused,
    subscriptionsPausedMessage: pausedMessage,
  };
}
