import type Stripe from "stripe";

export function checkoutSessionEmail(cs: Stripe.Checkout.Session): string | null {
  const fromDetails = cs.customer_details?.email?.trim().toLowerCase();
  if (fromDetails) return fromDetails;
  const cust = cs.customer;
  if (cust && typeof cust === "object" && !("deleted" in cust) && "email" in cust) {
    const e = (cust as Stripe.Customer).email?.trim().toLowerCase();
    if (e) return e;
  }
  return null;
}
