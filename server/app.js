// Express app factory. Separated from index.js so tests can import the
// configured app without binding to a port.
import express from "express";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import { securityMiddleware } from "./config/security.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { runWithRequestContext } from "./services/requestContext.js";

import loginRouter from "./routes/login.js";
import eventsRouter from "./routes/events.js";
import detailsRouter from "./routes/details.js";
import paymentsRouter from "./routes/payments.js";
import adyenRouter from "./routes/adyen.js";
import seatsRouter from "./routes/seats.js";
import threeDSRouter from "./routes/threeDS.js";
import customerRouter from "./routes/customer.js";
import proxyRouter from "./routes/proxy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp({ enableLogging = true } = {}) {
  const app = express();

  if (enableLogging) app.use(morgan("dev"));
  app.use(securityMiddleware);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  // Every request gets a fresh AsyncLocalStorage frame holding its
  // backend-api-call trail. The av builder pushes into it; the error
  // handler surfaces it under `backendApiCalls` in error responses.
  app.use((req, res, next) => runWithRequestContext(next));
  app.use(express.static(path.join(__dirname, "../public")));

  app.use("/", loginRouter);
  app.use("/", eventsRouter);
  app.use("/", detailsRouter);
  app.use("/", paymentsRouter);
  app.use("/", adyenRouter);
  app.use("/", seatsRouter);
  app.use("/", threeDSRouter);
  app.use("/", customerRouter);
  app.use("/", proxyRouter);

  app.use(errorHandler);

  return app;
}
