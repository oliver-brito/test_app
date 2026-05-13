// Parses the av-avon response to getPaymentClientConfig into the shape the
// Adyen Drop-in expects: { environment, clientKey, countryCode, currency, ... }.
//
// Returns null when the response doesn't have the expected shape, so the
// caller can fall back to the static configuration.

import { GET_PAYMENT_CLIENT_CONFIG } from "../../av/methods.js";
import { ADYEN_FALLBACK_CONFIG } from "./constants.js";

/**
 * @param {any} data Parsed av-avon response body.
 * @returns {object|null}
 */
export function parseAdyenClientConfig(data) {
  const returnData = data?.return?.[0];
  if (returnData?.method !== GET_PAYMENT_CLIENT_CONFIG) return null;
  if (returnData?.values?.[0]?.name !== "result") return null;

  let parsed;
  try {
    parsed = JSON.parse(returnData.values[0].value);
  } catch {
    return null;
  }
  const adyenConfig = parsed?.config;
  if (!adyenConfig) return null;

  return {
    environment: adyenConfig.adyen_env || ADYEN_FALLBACK_CONFIG.environment,
    clientKey: adyenConfig.adyen_client_key || ADYEN_FALLBACK_CONFIG.clientKey,
    countryCode: "US",
    currency: "USD",
    showPayButton: adyenConfig.adyen_showpaybutton || false,
    hostedFieldUps: adyenConfig.hosted_field_ups || false,
    hostedPageUps: adyenConfig.hosted_page_ups || false,
    phoneServiceUps: adyenConfig.phone_service_ups || false,
    adyenGatewayType: adyenConfig.adyen_gateway_type || false,
    deviceFingerprint: adyenConfig.device_fingerprint || null,
    rawConfig: adyenConfig,
  };
}
