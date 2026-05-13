import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ENDPOINTS } from "../../public/js/endpoints.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { API_BASE, UNL_USER, UNL_PASSWORD, PORT, HTTPS_PORT } = process.env;
const { AUTH: AUTH_PATH, UPCOMING: UPCOMING_PATH } = ENDPOINTS;

if (!API_BASE || !AUTH_PATH || !UNL_USER || !UNL_PASSWORD) {
  console.error("Missing API_BASE, AUTH_PATH, UNL_USER, or UNL_PASSWORD in environment (.env)");
  process.exit(1);
}

if (!UPCOMING_PATH) {
  console.warn("UPCOMING_PATH not defined in endpoints.js (needed for /events/upcoming)");
}

export const env = {
  API_BASE,
  UNL_USER,
  UNL_PASSWORD,
  httpPort: Number(PORT) || 3000,
  httpsPort: Number(HTTPS_PORT) || 3443,
};
