import { DateTime } from "luxon";

export type MembershipPlan = "associate" | "professional";

const NZ_TIMEZONE = "Pacific/Auckland";

export function isPromoWindowNz(now = DateTime.now()): boolean {
  const nzNow = now.setZone(NZ_TIMEZONE);
  return nzNow.month >= 1 && nzNow.month <= 6;
}

export function getNextJulyAnchorDate(now = DateTime.now()): DateTime {
  const nzNow = now.setZone(NZ_TIMEZONE);
  const anchorYear = nzNow.month >= 7 ? nzNow.year + 1 : nzNow.year;

  return DateTime.fromObject(
    {
      year: anchorYear,
      month: 7,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    { zone: NZ_TIMEZONE },
  );
}

export function getNextJulyAnchorEpoch(now = DateTime.now()): number {
  return Math.floor(getNextJulyAnchorDate(now).toSeconds());
}

export function getProratedAmountToJulyAnchor(
  annualAmount: number,
  now = DateTime.now(),
): number {
  const nzNow = now.setZone(NZ_TIMEZONE);
  const anchorYear = nzNow.month >= 7 ? nzNow.year + 1 : nzNow.year;
  const anchor = DateTime.fromObject(
    {
      year: anchorYear,
      month: 7,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    { zone: NZ_TIMEZONE },
  );
  const cycleStart = anchor.minus({ years: 1 });

  const remainingSeconds = Math.max(0, anchor.toSeconds() - nzNow.toSeconds());
  const cycleSeconds = Math.max(1, anchor.toSeconds() - cycleStart.toSeconds());
  const fraction = Math.max(0, Math.min(1, remainingSeconds / cycleSeconds));

  return Math.max(1, Math.round(annualAmount * fraction));
}

export function getSiteBaseUrl(requestUrl: string): string {
  const configured = import.meta.env.PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(requestUrl).origin;
}

export function getPriceForPlan(plan: MembershipPlan): string {
  const map: Record<MembershipPlan, string> = {
    associate: import.meta.env.STRIPE_PRICE_ASSOCIATE,
    professional: import.meta.env.STRIPE_PRICE_PROFESSIONAL,
  };

  return map[plan];
}

export function getPlanDisplayName(plan: MembershipPlan): string {
  return plan === "associate" ? "Associate Membership" : "Professional Membership";
}

export function getPromoCodeText(): string {
  return (import.meta.env.STRIPE_PROMO_CODE_TEXT || "LDTY8PQR").trim();
}

export function promoCodeMatches(input?: string): boolean {
  if (!input) return false;
  return input.trim().toUpperCase() === getPromoCodeText().toUpperCase();
}

export function formatAmountNzd(amountInCents: number): string {
  return `NZ$${(amountInCents / 100).toFixed(2)}`;
}
