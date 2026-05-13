import { ApiError } from "./errorHandler.js";

/**
 * Express middleware factory: validates `req.body` against a zod schema.
 * On failure, throws an ApiError(400) with the zod issues attached so the
 * central error handler can render a clean response.
 *
 * Usage:
 *   import { z } from "zod";
 *   const Body = z.object({ paymentId: z.string() });
 *   router.post("/x", express.json(), validate(Body), handler);
 *
 * The validated body replaces `req.body`, so downstream handlers can trust
 * the shape without re-checking.
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        new ApiError(400, "Invalid request body", {
          code: "VALIDATION_ERROR",
          details: result.error.issues,
        })
      );
    }
    req.body = result.data;
    next();
  };
}
