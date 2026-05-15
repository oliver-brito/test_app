// server/index.js — bootstrap (binds the app to a port).
import https from "https";
import { env } from "./config/env.js";
import { loadCredentials } from "./config/https.js";
import { createApp } from "./app.js";

const app = createApp();

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
