import { NextResponse, type NextRequest } from "next/server";
import { getRouteHandlerClient, getServiceRoleClient } from "@/lib/supabase/server";
import { walletTopupSchema } from "@/lib/validation/wallet";
import { addCreditsToWallet } from "@/lib/domain/wallet";
import { MockPaymentGateway } from "@/lib/domain/payments";

const CREDIT_PRICE_CENTS = 100;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const parsed = walletTopupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
  }

  const authClient = getRouteHandlerClient();

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError) {
    console.error(authError);
    return NextResponse.json({ error: "AUTH_ERROR" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { data: provider, error: providerError } = await authClient
    .from("providers")
    .select("id, currency")
    .eq("user_id", user.id)
    .maybeSingle();

  if (providerError) {
    console.error(providerError);
    return NextResponse.json({ error: "PROVIDER_LOOKUP_FAILED" }, { status: 500 });
  }

  if (!provider) {
    return NextResponse.json({ error: "PROVIDER_NOT_FOUND" }, { status: 404 });
  }

  const supabase = getServiceRoleClient();

  const { data: existingWallet, error: walletFetchError } = await supabase
    .from("wallets")
    .select("id, balance_credits, currency")
    .eq("provider_id", provider.id)
    .maybeSingle();

  if (walletFetchError) {
    console.error(walletFetchError);
    return NextResponse.json({ error: "WALLET_FETCH_FAILED" }, { status: 500 });
  }

  let walletRecord = existingWallet;

  if (!walletRecord) {
    const { data: insertedWallet, error: walletInsertError } = await supabase
      .from("wallets")
      .insert({ provider_id: provider.id, balance_credits: 0, currency: provider.currency })
      .select("id, balance_credits, currency")
      .single();

    if (walletInsertError) {
      console.error(walletInsertError);
      return NextResponse.json({ error: "WALLET_CREATE_FAILED" }, { status: 500 });
    }

    walletRecord = insertedWallet;
  }

  const domainWallet = {
    id: walletRecord.id,
    providerId: provider.id,
    balanceCredits: walletRecord.balance_credits,
    currency: walletRecord.currency,
  } as const;

  let outcome;
  try {
    outcome = addCreditsToWallet(domainWallet, parsed.data.credits);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "TOPUP_NOT_ALLOWED" }, { status: 400 });
  }

  const { error: walletUpdateError } = await supabase
    .from("wallets")
    .update({ balance_credits: outcome.wallet.balanceCredits })
    .eq("id", walletRecord.id);

  if (walletUpdateError) {
    console.error(walletUpdateError);
    return NextResponse.json({ error: "WALLET_UPDATE_FAILED" }, { status: 500 });
  }

  const { error: ledgerInsertError } = await supabase.from("wallet_ledger").insert({
    id: outcome.ledgerEntry.id,
    wallet_id: walletRecord.id,
    change_credits: outcome.ledgerEntry.changeCredits,
    description: outcome.ledgerEntry.description,
  });

  if (ledgerInsertError) {
    console.error(ledgerInsertError);
    // Attempt to revert wallet balance to previous amount to keep data consistent
    await supabase
      .from("wallets")
      .update({ balance_credits: walletRecord.balance_credits })
      .eq("id", walletRecord.id);

    return NextResponse.json({ error: "LEDGER_WRITE_FAILED" }, { status: 500 });
  }

  const paymentGateway = new MockPaymentGateway();
  const { checkoutUrl } = await paymentGateway.createTopupIntent(provider.id, parsed.data.credits);
  const amountCents = parsed.data.credits * CREDIT_PRICE_CENTS;

  const { error: paymentInsertError } = await supabase.from("payments").insert({
    provider_id: provider.id,
    status: "succeeded",
    amount_cents: amountCents,
    gateway: "mockpay",
    gateway_ref: `mockpay_topup_${outcome.ledgerEntry.id}`,
    metadata: {
      strategy: "credit_topup",
      credits: parsed.data.credits,
      checkoutUrl,
    },
  });

  if (paymentInsertError) {
    console.error(paymentInsertError);
  }

  return NextResponse.json({
    status: "succeeded",
    wallet: {
      id: walletRecord.id,
      balanceCredits: outcome.wallet.balanceCredits,
      currency: outcome.wallet.currency,
    },
    ledgerEntry: {
      id: outcome.ledgerEntry.id,
      changeCredits: outcome.ledgerEntry.changeCredits,
      description: outcome.ledgerEntry.description,
    },
    payment: {
      amountCents,
      gateway: "mockpay",
      checkoutUrl,
    },
  });
}
