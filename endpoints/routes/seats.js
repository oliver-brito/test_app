// routes/seats.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { authHeaders } from "../utils/authHeaders.js";
import { CURRENT_SESSION } from "../utils/sessionStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const router = express.Router();

// --- Environment variables from .env
const {
  API_BASE,
  ORDER_PATH
} = process.env;

// POST /removeSeat -> Remove an admission by ID using manageAdmissions
router.post('/removeSeat', express.json(), async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { admissionId } = req.body || {};
    if (!admissionId) {
      return res.status(400).json({ error: "Missing admissionId" });
    }
    console.log(`Removing admission ID: ${admissionId}`);
    const url = new URL(ORDER_PATH, API_BASE).toString();
    const payload = {
      actions: [
        {
          method: "manageAdmissions",
          params: {
            removeAdmissionID: [admissionId]
          },
          acceptWarnings: [5414]
        }
      ],
      get: ["Order", "Admissions", "AvailablePaymentMethods", "DeliveryMethodDetails", "Seats"],
      objectName: "myOrder"
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    if (!r.ok) {
      return res.status(r.status).json({ error: "Failed to remove admission", details: data });
    }
    res.json({ success: true, response: data });
    console.log(`Admission ID ${admissionId} removal response:`, raw);
  } catch (err) {
    console.error("Error in /removeSeat:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;