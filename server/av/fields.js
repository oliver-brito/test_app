// av-avon field-path strings. Stored as constants so a developer can grep
// "where does X come from" and find every reference.
//
// Top-level keys (returned in payload.get) are bare object names
// (Order, Customer, Payments, ...). Scoped fields use the "X::field"
// convention (Order::order_number). Per-row fields under a parent record
// use "X::<id>::field" — use `paymentField(id, key)` to build those.

// Top-level object slots
export const ORDER = "Order";
export const ADMISSIONS = "Admissions";
export const PAYMENTS = "Payments";
export const CUSTOMER = "Customer";
export const CONTACTS = "Contacts";
export const ADDRESSES = "Addresses";
export const PERFORMANCE = "Performance";
export const PRICETYPES = "pricetypes";
export const AVAILABLE_PAYMENT_METHODS = "AvailablePaymentMethods";
export const DELIVERY_METHOD_DETAILS = "DeliveryMethodDetails";
export const SEARCH_RESULTS = "SearchResults";
export const SEATS = "Seats";

// Scoped fields
export const ORDER_NUMBER = "Order::order_number";
export const ORDER_DELIVERY_METHOD_ID = "Order::deliverymethod_id";
export const CUSTOMER_ID = "Customer::customer_id";

// Session-scoped fields — returned under `session.get` on /login's /user
// call, distinct from the customer object's own scoped fields above.
export const SESSION_CUSTOMER_ID = "customer_id";

// Search criteria
export const SEARCH_OBJECT_TYPE = "SearchCriteria::object_type_filter";
export const SEARCH_QUERY = "SearchCriteria::search_criteria";
export const SEARCH_FROM = "SearchCriteria::search_from";
export const SEARCH_TO = "SearchCriteria::search_to";
export const SEARCH_TOTAL_RECORDS = "SearchResultsInfo::total_records";
export const SEARCH_CURRENT_PAGE = "SearchResultsInfo::current_page";
export const SEARCH_TOTAL_PAGES = "SearchResultsInfo::total_pages";

/**
 * Build a per-payment field path. `paymentField("PMT-1", "active_payment")`
 * yields `"Payments::PMT-1::active_payment"`.
 */
export const paymentField = (paymentId, key) => `Payments::${paymentId}::${key}`;

// Common keys passed to paymentField. Useful when grepping for usage.
export const PAYMENT_FIELDS = {
  ID: "payment_id",
  ACTIVE_PAYMENT: "active_payment",
  CARDHOLDER_NAME: "cardholder_name",
  SWIPE_INDICATOR: "swipe_indicator",
  EXTERNAL_PAYMENT_DATA: "external_payment_data",
  PA_REQUEST_INFORMATION: "pa_request_information",
  PA_REQUEST_URL: "pa_request_URL",
  PA_RESPONSE_INFORMATION: "pa_response_information",
  PA_RESPONSE_URL: "pa_response_URL",
  PAYMENTMETHOD_TYPE: "paymentmethod_type",
  PAYMENTMETHOD_GATEWAY_CONFIG: "paymentmethod_gateway_config",
};
