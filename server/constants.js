// Magic values that used to be inlined across routes/utilities.

// av-avon exception numbers
export const EXCEPTION_CODES = {
  THREE_DS_REQUIRED: 4294,
  PAYMENT_CANCELLED: 2018,
};

// av-avon warning codes the API may emit that we explicitly accept
// when calling insertOrder / manageAdmissions / getPaymentClientConfig.
export const ACCEPTED_WARNINGS = {
  INSERT_ORDER: [5008, 4224, 5388],
  REMOVE_ADMISSION: [5414],
  PAYMENT_CLIENT_CONFIG: [EXCEPTION_CODES.THREE_DS_REQUIRED],
};

// Hosted-fields placeholder used during checkout when the API requires a
// cardholder_name value but the real value comes from the payment widget.
export const DEFAULT_CARDHOLDER_NAME = "Oliver Brito";
