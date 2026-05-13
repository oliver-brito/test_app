import { printDebugMessage } from "./debug.js";
import { validateCall } from "./common.js";

/**
 * Wraps a route handler with standard error handling.
 * Eliminates the need for try-catch in every route.
 * @param {Function} handler - Async route handler function
 * @returns {Function} Wrapped handler with error handling
 */
export function wrapRoute(handler) {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (err) {
            printDebugMessage(`Error in route: ${err.message}`);

            // Don't send response if already sent
            if (res.headersSent) {
                return next(err);
            }

            res.status(500).json({
                error: String(err?.message || err)
            });
        }
    };
}

/**
 * Wraps a route handler with validation and error handling.
 * @param {Function} handler - Async route handler
 * @param {object} validation - Validation requirements
 * @param {string[]} validation.params - Required body parameters
 * @param {string[]} validation.paths - Required endpoint paths
 * @param {string} validation.name - Route name for logging
 * @returns {Function} Wrapped handler
 */
export function wrapRouteWithValidation(handler, validation) {
    return wrapRoute(async (req, res, next) => {
        const { params = [], paths = [], name = "route" } = validation;
        validateCall(req, params, paths, name);
        await handler(req, res, next);
    });
}
