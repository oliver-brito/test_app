import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { MY_ORDER } from "../../av/objectNames.js";
import { GET_PAYMENT_CLIENT_TOKEN } from "../../av/methods.js";
import { ORDER_NUMBER, PAYMENTS } from "../../av/fields.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/**
 * Ask av-avon for the gateway client token. A 4294 response is expected
 * here during 3DS flows — surfaceThreeDS keeps the orchestrator alive so
 * the caller can launch the challenge instead of bailing with a 500.
 */
export async function getClientToken(ctx, { paymentId, paResponseURL }) {
  return ctx.call(
    ORDER_PATH,
    {
      actions: [
        {
          method: GET_PAYMENT_CLIENT_TOKEN,
          params: { payment_id: paymentId, pa_response_URL: paResponseURL },
        },
      ],
      get: [ORDER_NUMBER, PAYMENTS],
      objectName: MY_ORDER,
    },
    "Checkout failed (getPaymentClientToken)",
    { surfaceThreeDS: true }
  );
}
