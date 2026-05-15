import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Stub insertOrder (called by /transaction). We don't want to hit av-avon
// in tests — just exercise the route shape + error/success branches.
vi.mock("../../server/services/order.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, insertOrder: vi.fn() };
});

const { insertOrder } = await import("../../server/services/order.js");
const { createApp } = await import("../../server/app.js");

const app = createApp({ enableLogging: false, enableSessionGate: false });

describe("POST /transaction", () => {
  beforeEach(() => {
    insertOrder.mockReset();
  });

  it("returns 400 + zod error when the body is empty", async () => {
    const res = await request(app).post("/transaction").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.details[0].path).toEqual(["paymentId"]);
    expect(insertOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when paymentId is an empty string", async () => {
    const res = await request(app).post("/transaction").send({ paymentId: "" });
    expect(res.status).toBe(400);
    expect(insertOrder).not.toHaveBeenCalled();
  });

  it("returns the viewOrder redirect payload on a successful insertOrder", async () => {
    insertOrder.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { data: { "Order::order_number": { standard: "ORD-99" } } },
    });

    const res = await request(app).post("/transaction").send({ paymentId: "PMT-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirectUrl).toMatch(/^\/viewOrder\.html\?orderId=ORD-99/);
    expect(res.body.transactionDetails.orderId).toBe("ORD-99");
  });

  it("surfaces upstream failure details when insertOrder responds !ok", async () => {
    insertOrder.mockResolvedValueOnce({
      response: { ok: false, status: 502 },
      data: { exception: { number: 7777, message: "Upstream boom" } },
    });

    const res = await request(app).post("/transaction").send({ paymentId: "PMT-1" });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Transaction failed");
    expect(res.body.details.exception.number).toBe(7777);
  });
});
