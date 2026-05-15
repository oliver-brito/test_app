import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certKeyPath = path.resolve(__dirname, "../../certs/localhost-key.pem");
const certCertPath = path.resolve(__dirname, "../../certs/localhost-cert.pem");

export async function loadCredentials() {
  try {
    const [key, cert] = await Promise.all([
      fs.readFile(certKeyPath),
      fs.readFile(certCertPath),
    ]);
    return { key, cert };
  } catch {
    return null;
  }
}
