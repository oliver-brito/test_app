import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";

import { handler } from "../../server/middleware/handler.js";
import { errorHandler, ApiError } from "../../server/middleware/errorHandler.js";
import { runWithRequestContext, recordApiCall } from "../../server/services/requestContext.js";

function buildApp(routePath, spec) {
  const app = express();
  app.use((req, res, next) => runWithRequestContext(next));
  app.post(routePath, handler(spec));
  app.use(errorHandler);
  return app;
}

describe("handler({ body, run })", () => {
  it("validates the body against the zod schema and 400s on failure", async () => {
    const app = buildApp("/x", {
      body: z.object({ name: z.string() }),
      async run({ name }) {
        return { hello: name };
      },
    });

    const res = await request(app).post("/x").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.details[0].path).toEqual(["name"]);
  });

  it("sends the run() return value as JSON", async () => {
    const app = buildApp("/x", {
      body: z.object({ name: z.string() }),
      async run({ name }) {
        return { hello: name };
      },
    });

    const res = await request(app).post("/x").send({ name: "world" });
    expect(res.status).toBe(200);
    expect(res.body.hello).toBe("world");
  });

  it("auto-attaches the per-request backendApiCalls trail", async () => {
    const app = buildApp("/x", {
      async run() {
        // Simulate an av-avon call recording its trail.
        recordApiCall({ method: "POST", endpoint: "/fake", status: 200 });
        return { ok: true };
      },
    });

    const res = await request(app).post("/x").send({});
    expect(res.body.ok).toBe(true);
    expect(res.body.backendApiCalls).toHaveLength(1);
    expect(res.body.backendApiCalls[0].endpoint).toBe("/fake");
  });

  it("propagates ApiError through to the error middleware", async () => {
    const app = buildApp("/x", {
      async run() {
        throw new ApiError(404, "Not found", { details: { reason: "gone" } });
      },
    });

    const res = await request(app).post("/x").send({});
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Not found");
    expect(res.body.details.reason).toBe("gone");
  });

  it("leaves the response alone when run() returns undefined", async () => {
    const app = buildApp("/x", {
      async run(_input, { res }) {
        res.status(201).json({ explicit: true });
      },
    });

    const res = await request(app).post("/x").send({});
    expect(res.status).toBe(201);
    expect(res.body.explicit).toBe(true);
    expect(res.body.backendApiCalls).toBeUndefined();
  });
});
