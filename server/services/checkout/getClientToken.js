import { ENDPOINTS } from "../../../public/js/endpoints.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/**
 * Ask av-avon for the gateway client token. A 4294 response is expected here
 * during 3DS flows, so surfaceThreeDS lets the orchestrator forward it
 * rather than treating it as a hard error.
 */
export async function getClientToken(ctx, { paymentId, paResponseURL }) {
  return ctx.call(
    ORDER_PATH,
    {
      actions: [
        {
          method: "getPaymentClientToken",
          params: { payment_id: paymentId, pa_response_URL: paResponseURL },
        },
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder",
    },
    "Checkout failed (getPaymentClientToken)",
    { surfaceThreeDS: true }
  );
}
