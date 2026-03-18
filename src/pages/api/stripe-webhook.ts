import type { APIRoute } from "astro";
import Stripe from "stripe";

async function handleOptionCCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.metadata?.flow !== "option_c") return;

  const recurringPriceId = session.metadata?.recurring_price_id;
  const billingAnchorRaw = session.metadata?.billing_anchor_epoch;
  const plan = session.metadata?.plan;
  const customerId =
    typeof session.customer === "string" ? session.customer : undefined;

  if (!recurringPriceId || !billingAnchorRaw || !customerId) {
    return;
  }

  const billingAnchorEpoch = Number.parseInt(billingAnchorRaw, 10);
  if (!Number.isFinite(billingAnchorEpoch)) {
    return;
  }

  let paymentMethodId: string | undefined;
  if (typeof session.payment_intent === "string") {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      session.payment_intent,
    );
    if (typeof paymentIntent.payment_method === "string") {
      paymentMethodId = paymentIntent.payment_method;
    }
  }

  if (paymentMethodId) {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: recurringPriceId }],
    trial_end: billingAnchorEpoch,
    metadata: {
      flow: "option_c",
      plan: plan || "",
      source_checkout_session: session.id,
    },
  };

  if (paymentMethodId) {
    subscriptionParams.default_payment_method = paymentMethodId;
  }

  await stripe.subscriptions.create(subscriptionParams, {
    idempotencyKey: `option-c-subscription-${session.id}`,
  });
}

export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET?.trim();
  const secretKey = import.meta.env.STRIPE_SECRET_KEY?.trim();

  if (!signature || !webhookSecret || !secretKey) {
    return new Response("Missing webhook config.", { status: 400 });
  }

  const stripe = new Stripe(secretKey);
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return new Response("Invalid webhook signature.", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleOptionCCheckoutCompleted(
          stripe,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "invoice.paid":
      case "invoice.payment_failed":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      default:
        break;
    }
  } catch {
    return new Response("Webhook processing failed.", { status: 500 });
  }

  return Response.json({ received: true });
};
