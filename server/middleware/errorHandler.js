import { printDebugMessage } from "../utils/debug.js";

/**
 * Thrown by route handlers when they want to surface a specific HTTP status,
 * structured payload, and (optionally) machine-readable error code. The
 * central error middleware below converts it into a JSON response.
 */
export class ApiError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Express 4-arg error middleware. Mounted last in server/index.js so any
 * uncaught error (sync throw, awaited rejection, or explicit next(err))
 * from a handler ends up here.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    // Response already started — let Express close the connection.
    return _next(err);
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      details: err.details ?? null,
    });
  }

  printDebugMessage(`Unhandled error in ${req.method} ${req.path}: ${err?.stack || err}`);
  return res.status(500).json({
    error: err?.message || "Internal server error",
  });
}
