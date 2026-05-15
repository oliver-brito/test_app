import { ApiError } from "./errorHandler.js";

/**
 * Express middleware factory: validates `req[source]` against a zod
 * schema. On failure, throws an ApiError(400) with the zod issues
 * attached so the central error handler can render a clean response.
 *
 * `source` defaults to "body" but can be "query" or "params".
 *
 * The validated value replaces `req[source]`, so downstream handlers
 * can trust the shape without re-checking.
 */
export function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new ApiError(400, "Invalid request body", {
          code: "VALIDATION_ERROR",
          details: result.error.issues,
        })
      );
    }
    req[source] = result.data;
    next();
  };
}
