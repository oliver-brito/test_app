import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the underlying API helper before importing the orchestrator. Vitest
// hoists vi.mock so the mock is in place when context.js imports it.
vi.mock("../../../server/services/av.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, _execute: vi.fn() };
});

const { _execute } = await import("../../../server/services/av.js");
const { runCheckoutSequence } = await import(
  "../../../server/services/checkout/orchestrator.js"
);

function ok(data, title = "step") {
  return {
    response: { ok: true, status: 200 },
    data,
    apiCallMetadata: { title, status: 200, method: "POST", endpoint: "/x" },
  };
}

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("runCheckoutSequence", () => {
  beforeEach(() => {
    _execute.mockReset();
  });

  it("calls all 6 steps in order and returns aggregated metadata", async () => {
    // Script the 6 sequential calls. Step 0 returns customer_id; step 2 returns
    // an empty Payments map so step 3 (addPayment) is triggered; step 3 returns
    // a Payments map containing a payment_id; remaining steps return ok.
    _execute
      .mockResolvedValueOnce(
        ok({ data: { "Customer::customer_id": { standard: "CUST-1" } } }, "getCustomerId")
      )
      .mockResolvedValueOnce(ok({ data: { "Order::order_number": "ORD-1" } }, "addCustomer"))
      .mockResolvedValueOnce(ok({ data: { Payments: {} } }, "checkPayments"))
      .mockResolvedValueOnce(
        ok(
          { data: { Payments: { "1": { payment_id: { standard: "PAY-1" } } } } },
          "addPayment"
        )
      )
      .mockResolvedValueOnce(ok({}, "setDeliveryAndPayment"))
      .mockResolvedValueOnce(ok({}, "getClientToken"))
      .mockResolvedValueOnce(
        ok({ data: { "Payments::PAY-1": { foo: "bar" } } }, "getPaymentDetails")
      );

    const res = mockRes();
    const result = await runCheckoutSequence(res, {
      deliveryMethod: "MAIL",
      paymentMethod: "VISA",
      paResponseURL: "https://example/return",
    });

    expect(result).not.toBeNull();
    expect(result.paymentId).toBe("PAY-1");
    expect(result.payment_details).toEqual({ foo: "bar" });
    expect(result.backendApiCalls).toHaveLength(7);

    const titles = result.backendApiCalls.map((c) => c.title);
    expect(titles).toEqual([
      "getCustomerId",
      "addCustomer",
      "checkPayments",
      "addPayment",
      "setDeliveryAndPayment",
      "getClientToken",
      "getPaymentDetails",
    ]);
    expect(res.json).not.toHaveBeenCalled();
  });

  it("skips addPayment when the order already has a Payment record", async () => {
    _execute
      .mockResolvedValueOnce(
        ok({ data: { "Customer::customer_id": { standard: "CUST-1" } } }, "getCustomerId")
      )
      .mockResolvedValueOnce(ok({}, "addCustomer"))
      .mockResolvedValueOnce(
        ok(
          { data: { Payments: { "1": { payment_id: { standard: "EXISTING-PAY" } } } } },
          "checkPayments"
        )
      )
      .mockResolvedValueOnce(ok({}, "setDeliveryAndPayment"))
      .mockResolvedValueOnce(ok({}, "getClientToken"))
      .mockResolvedValueOnce(ok({ data: { "Payments::EXISTING-PAY": {} } }, "getPaymentDetails"));

    const res = mockRes();
    const result = await runCheckoutSequence(res, {
      deliveryMethod: "MAIL",
      paymentMethod: "VISA",
      paResponseURL: "https://example/return",
    });

    expect(result.paymentId).toBe("EXISTING-PAY");
    expect(_execute).toHaveBeenCalledTimes(6);
    const callTitles = result.backendApiCalls.map((c) => c.title);
    expect(callTitles).not.toContain("addPayment");
  });

  it("propagates the upstream error when a step throws", async () => {
    // Step 0 returns customer_id; step 1 (addCustomer) rejects with an
    // ApiError-like throw — ctx.call should re-throw with the trail attached.
    _execute
      .mockResolvedValueOnce(
        ok({ data: { "Customer::customer_id": { standard: "CUST-1" } } }, "getCustomerId")
      )
      .mockRejectedValueOnce(Object.assign(new Error("addCustomer boom"), { status: 502 }));

    const res = mockRes();
    await expect(
      runCheckoutSequence(res, {
        deliveryMethod: "MAIL",
        paymentMethod: "VISA",
        paResponseURL: "https://example/return",
      })
    ).rejects.toThrow("addCustomer boom");
    expect(_execute).toHaveBeenCalledTimes(2);
  });
});
