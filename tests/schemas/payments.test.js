import { describe, it, expect } from "vitest";
import {
  TransactionBody,
  CheckoutBody,
  ProcessAdyenPaymentBody,
  PaymentIdBody,
} from "../../server/schemas/payments.js";

describe("payments schemas", () => {
  describe("TransactionBody", () => {
    it("accepts a string paymentId", () => {
      expect(TransactionBody.safeParse({ paymentId: "PMT-1" }).success).toBe(true);
    });

    it("rejects an empty body", () => {
      const result = TransactionBody.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(["paymentId"]);
    });

    it("rejects an empty string paymentId", () => {
      expect(TransactionBody.safeParse({ paymentId: "" }).success).toBe(false);
    });
  });

  describe("CheckoutBody", () => {
    it("requires both deliveryMethod and paymentMethod", () => {
      const result = CheckoutBody.safeParse({});
      expect(result.success).toBe(false);
      const paths = result.error?.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["deliveryMethod", "paymentMethod"]));
    });

    it("accepts a complete body", () => {
      expect(
        CheckoutBody.safeParse({ deliveryMethod: "MAIL", paymentMethod: "VISA" }).success
      ).toBe(true);
    });
  });

  describe("ProcessAdyenPaymentBody", () => {
    it("requires externalData and paymentID", () => {
      expect(ProcessAdyenPaymentBody.safeParse({}).success).toBe(false);
    });

    it("accepts resetPaymentAttempt as an optional boolean", () => {
      expect(
        ProcessAdyenPaymentBody.safeParse({
          externalData: { foo: "bar" },
          paymentID: "PMT-1",
          resetPaymentAttempt: true,
        }).success
      ).toBe(true);
    });
  });

  describe("PaymentIdBody", () => {
    it("accepts a paymentID", () => {
      expect(PaymentIdBody.safeParse({ paymentID: "PMT-1" }).success).toBe(true);
    });

    it("rejects missing paymentID", () => {
      expect(PaymentIdBody.safeParse({}).success).toBe(false);
    });
  });
});
