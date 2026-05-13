// Extracts the JSON-encoded payment-methods payload from a Payments
// record's `paymentmethod_gateway_config` field. The av-avon API stores
// it as a string with potentially `standard`, `display`, or `input` keys.
//
// Returns `{ paymentMethodsResponse: object }` on success,
// `{ warning: ... }` when the JSON string is missing,
// or `{ parseError: ... }` when the JSON fails to parse.

/**
 * @param {{ standard?: string, display?: string, input?: string } | undefined} gatewayConfig
 * @returns {{
 *   paymentMethodsResponse?: object,
 *   warning?: string,
 *   parseError?: string,
 * }}
 */
export function parseAdyenGatewayConfig(gatewayConfig) {
  const json =
    gatewayConfig?.standard || gatewayConfig?.display || gatewayConfig?.input;
  if (!json) return { warning: "No payment methods configuration found" };
  try {
    return { paymentMethodsResponse: JSON.parse(json) };
  } catch (parseError) {
    return { parseError: parseError.message };
  }
}
