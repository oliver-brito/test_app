// Endpoint-handler factory. Each route file declares its endpoints as
// named consts via `handler({ body, query, run })`, and mounts them at
// the bottom of the file with `router.<method>("/path", named)`.
//
// What the factory does:
//   - Mounts express.json() + zod validate(body)   (when body is given)
//   - Mounts zod validate(query, "query")           (when query is given)
//   - Calls `run(input, ctx)` inside a try/catch + AsyncLocalStorage
//     frame for the per-request apiCalls trail.
//   - `input` is { ...req.params, ...validated body, ...validated query }.
//   - `ctx`   is { req, res }.
//   - If `run` returns a value, the factory sends it as JSON, with the
//     auto-collected `backendApiCalls` appended.
//   - If `run` returns undefined, the factory leaves the response alone
//     (handler already sent it).
//   - If `run` throws, the error flows to the central errorHandler.

import express from "express";
import { validate } from "./validate.js";
import { getApiCalls } from "../services/requestContext.js";

/**
 * @typedef {Object} HandlerSpec
 * @property {import('zod').ZodTypeAny} [body]
 * @property {import('zod').ZodTypeAny} [query]
 * @property {(input: object, ctx: { req: any, res: any }) => any} run
 */

/**
 * Build the middleware chain for a single endpoint.
 * @param {HandlerSpec} spec
 * @returns {import('express').RequestHandler[]}
 */
export function handler({ body, query, run }) {
  const chain = [];
  if (body) chain.push(express.json(), validate(body, "body"));
  if (query) chain.push(validate(query, "query"));

  chain.push(async (req, res, next) => {
    try {
      const input = {
        ...(req.params || {}),
        ...(req.body || {}),
        ...(req.query || {}),
      };
      const payload = await run(input, { req, res });
      if (payload === undefined || res.headersSent) return;

      // Auto-attach the per-request av-avon call trail so the UI debug
      // console can replay it. Routes never write this manually.
      const apiCalls = getApiCalls();
      res.json({
        ...payload,
        ...(apiCalls.length ? { backendApiCalls: apiCalls } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  return chain;
}
