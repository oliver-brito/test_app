// Fallback Adyen Drop-in client configuration. Returned by
// /getPaymentClientConfig when the user is unauthenticated or the upstream
// av-avon call fails — lets the UI render the payment widget even before
// a real session exists.

export const ADYEN_FALLBACK_CONFIG = {
  environment: "test",
  clientKey: "test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ",
  countryCode: "US",
  currency: "USD",
};
