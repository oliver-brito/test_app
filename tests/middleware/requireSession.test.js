import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

import { requireSession } from "../../server/middleware/requireSession.js";
import { ApiError } from "../../server/middleware/errorHandler.js";
import { setSession, clearSession } from "../../server/utils/sessionStore.js";
import { hasActiveSession } from "../../server/services/av.js";
import { createApp } from "../../server/app.js";

const app = createApp({ enableLogging: false /* enableSessionGate defaults true */ });

describe("requireSession middleware", () => {
  beforeEach(() => clearSession());
  afterEach(() => clearSession());

  // ---- Unit tests: middleware called directly --------------------------
  describe("unit", () => {
    function callMiddleware(path) {
      const req = { path };
      const res = {};
      const next = vi.fn();
      requireSession(req, res, next);
      return next;
    }

    it("calls next() with no error when a session is active", () => {
      setSession("S-1", "Cookie=value", "https://av.example");
      expect(hasActiveSession()).toBe(true);

      const next = callMiddleware("/events/upcoming");
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(); // no args == no error
    });

    it("forwards an ApiError(401, SESSION_EXPIRED) when no session is active", () => {
      const next = callMiddleware("/events/upcoming");
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(401);
      expect(err.code).toBe("SESSION_EXPIRED");
    });

    it.each([
      ["/login"],
      ["/auth/defaults"],
      ["/getPaymentClientConfig"],
      ["/proxy"],
    ])("lets %s through even without a session (exempt path)", (path) => {
      const next = callMiddleware(path);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ---- Integration tests: full Express app via supertest ---------------
  describe("integration (via supertest)", () => {
    it("protected GET route returns 401 SESSION_EXPIRED without a session", async () => {
      const res = await request(app).get("/events/upcoming");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("SESSION_EXPIRED");
    });

    it("protected POST route also returns 401", async () => {
      const res = await request(app).post("/transaction").send({ paymentId: "PMT-1" });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("SESSION_EXPIRED");
    });

    it("/auth/defaults is reachable without a session", async () => {
      const res = await request(app).get("/auth/defaults");
      expect(res.status).toBe(200);
      expect(res.body.apiBase).toBeDefined();
    });

    it("/getPaymentClientConfig is reachable without a session (has its own fallback)", async () => {
      const res = await request(app).post("/getPaymentClientConfig").send({});
      expect(res.status).toBe(200);
      expect(res.body.environment).toBe("test");
    });

    it("does not 401 when enableSessionGate is false (test-mode app)", async () => {
      const testApp = createApp({ enableLogging: false, enableSessionGate: false });
      const res = await request(testApp).get("/events/upcoming");
      expect(res.status).not.toBe(401);
    });
  });
});
