export interface PaymentGateway {
  createTopupIntent(providerId: string, credits: number): Promise<{ checkoutUrl: string }>;
  createPerBookingIntent(
    bookingId: string,
    amountCents: number,
  ): Promise<{ checkoutUrl: string; reference: string }>;
  verifyWebhook(sig: string, rawBody: string): boolean;
  parseEvent(rawBody: string): { type: "payment.succeeded" | "payment.failed"; refId: string };
}

export class MockPaymentGateway implements PaymentGateway {
  async createTopupIntent(providerId: string, credits: number): Promise<{ checkoutUrl: string }> {
    return { checkoutUrl: `https://mockpay.local/topup?provider=${providerId}&credits=${credits}` };
  }

  async createPerBookingIntent(
    bookingId: string,
    amountCents: number,
  ): Promise<{ checkoutUrl: string; reference: string }> {
    const reference = `mockpay_${bookingId}`;
    return {
      checkoutUrl: `https://mockpay.local/booking/${bookingId}?amount=${amountCents}`,
      reference,
    };
  }

  verifyWebhook(_sig: string, _rawBody: string): boolean {
    return true;
  }

  parseEvent(rawBody: string): { type: "payment.succeeded" | "payment.failed"; refId: string } {
    const payload = JSON.parse(rawBody);
    if (payload.status === "succeeded") {
      return { type: "payment.succeeded", refId: payload.refId };
    }
    return { type: "payment.failed", refId: payload.refId };
  }
}
