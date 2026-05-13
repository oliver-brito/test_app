// server/index.js
import express from "express";
import https from "https";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { securityMiddleware } from "./config/security.js";
import { loadCredentials } from "./config/https.js";
import { errorHandler } from "./middleware/errorHandler.js";

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

const app = express();

app.use(morgan("dev"));
app.use(securityMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
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

const credentials = await loadCredentials();
if (credentials) {
  https.createServer(credentials, app).listen(env.httpsPort, () => {
    console.log(`HTTPS listening at https://localhost:${env.httpsPort} (certs auto-detected)`);
  });
} else {
  app.listen(env.httpPort, () => {
    console.log(`HTTP listening at http://localhost:${env.httpPort} (no certs detected)`);
  });
}
