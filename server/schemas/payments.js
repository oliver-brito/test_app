// zod schemas for the payment-related routes. Applied via the `validate`
// middleware (server/middleware/validate.js) which rejects malformed
// requests with a 400 before the handler runs.

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
  paymentId: z.string().min(1),
  resetPaymentAttempt: z.boolean().optional(),
});

export const PaymentIdBody = z.object({
  paymentId: z.string().min(1),
});
