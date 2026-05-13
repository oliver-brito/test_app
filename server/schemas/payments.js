import { z } from "zod";

export const TransactionBody = z.object({
  paymentId: z.string().min(1),
});

export const CheckoutBody = z.object({
  deliveryMethod: z.string().min(1),
  paymentMethod: z.string().min(1),
});

export const ProcessAdyenPaymentBody = z.object({
  externalData: z.unknown(),
  paymentID: z.string().min(1),
  resetPaymentAttempt: z.boolean().optional(),
});

export const PaymentIdBody = z.object({
  paymentID: z.string().min(1),
});
