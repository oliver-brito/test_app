// av-avon action method names (the `actions[].method` field on the API).

// Order lifecycle
export const INSERT = "insert";
export const ADD_CUSTOMER = "addCustomer";
export const ADD_PAYMENT = "addPayment";
export const MANAGE_ADMISSIONS = "manageAdmissions";

// Map / pricing / availability
export const GET_BEST_AVAILABLE = "getBestAvailable";
export const LOAD_BEST_AVAILABLE = "loadBestAvailable";
export const LOAD_AVAILABILITY = "loadAvailability";

// Generic load (Performance, Customer, etc.)
export const LOAD = "load";

// Search pagination
export const SEARCH = "search";
export const NEXT_PAGE = "nextPage";
export const PREV_PAGE = "prevPage";

// Payment / Adyen
export const GET_PAYMENT_CLIENT_CONFIG = "getPaymentClientConfig";
export const GET_PAYMENT_CLIENT_TOKEN = "getPaymentClientToken";
