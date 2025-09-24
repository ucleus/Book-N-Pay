import { z } from "zod";

export const walletTopupSchema = z.object({
  credits: z.number().int().min(1).max(100),
});

export type WalletTopupInput = z.infer<typeof walletTopupSchema>;
