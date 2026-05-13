// Central Express error middleware + the ApiError class thrown by routes
// and services.
//
// Services throw `new ApiError(status, message, { details, code, ... })`
// instead of writing the response themselves. The middleware below
// converts the throw into a uniform JSON response and includes the
// backendApiCalls trail so the browser-side debug console can replay it.

import { printDebugMessage } from "../utils/debug.js";

/**
 * Thrown by route handlers and services to surface a specific HTTP status
 * and (optionally) a machine-readable code, payload details, the av-avon
 * endpoint that failed, and the apiCalls collected so far.
 */
export class ApiError extends Error {
  constructor(status, message, opts = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = opts.code;
    this.details = opts.details ?? null;
    this.endpoint = opts.endpoint;
    this.requestPayload = opts.requestPayload;
    this.apiCallMetadata = opts.apiCallMetadata; // the failing call
    this.backendApiCalls = opts.backendApiCalls; // trail accumulated so far
  }
}

/**
 * 4-arg error middleware mounted last in `server/app.js`. Any uncaught
 * throw or `next(err)` reaches here.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return _next(err);

  if (err instanceof ApiError) {
    printDebugMessage(`${err.message}: ${err.status}`);
    return res.status(err.status).json({
      error: err.message,
      message: err.message,
      code: err.code,
      status: err.status,
      endpoint: err.endpoint ?? null,
      request: err.requestPayload
        ? { endpoint: err.endpoint, payload: err.requestPayload, timestamp: new Date().toISOString() }
        : null,
      response: err.details,
      details: err.details,
      backendApiCalls: err.backendApiCalls ?? (err.apiCallMetadata ? [err.apiCallMetadata] : []),
      debugInfo: { timestamp: new Date().toISOString() },
    });
  }

  printDebugMessage(`Unhandled error in ${req.method} ${req.path}: ${err?.stack || err}`);
  return res.status(500).json({ error: err?.message || "Internal server error" });
}
