import express from "express";
import Stripe from "stripe";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Criar checkout
app.post("/create-checkout-session", async (req, res) => {
  const { userId, packageType } = req.body;

  const prices = {
    initial: process.env.PRICE_ID_INITIAL,
    standard: process.env.PRICE_ID_STANDARD,
    advanced: process.env.PRICE_ID_ADVANCED
  };

  const tokensMap = {
    initial: 20,
    standard: 100,
    advanced: 250
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      { price: prices[packageType], quantity: 1 }
    ],
    success_url: `${process.env.SUCCESS_URL}?success=true`,
    cancel_url: `${process.env.CANCEL_URL}?canceled=true`,
    metadata: {
      user_id: userId,
      tokens: tokensMap[packageType]
    }
  });

  res.json({ url: session.url });
});

// Webhook Stripe
app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send("Webhook error");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session.metadata.user_id;
      const tokens = Number(session.metadata.tokens);

      await supabase.rpc("add_tokens", {
        p_user_id: userId,
        p_tokens: tokens
      });
    }

    res.json({ received: true });
  }
);

app.listen(3000, () =>
  console.log("Stripe backend rodando")
);
