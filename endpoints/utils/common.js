import dotenv from "dotenv"; // Ensure .env variables are loaded even if this file is imported before server bootstrap
import { CURRENT_SESSION } from "../utils/sessionStore.js";
import { printDebugMessage } from "../utils/debug.js";
import { authHeaders } from "../utils/authHeaders.js";
import { parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";
import { getCookies, setCookies } from "../utils/sessionStore.js";
import path from "path";
import { fileURLToPath } from "url";

// Resolve project root and load .env once (idempotent if already loaded elsewhere)
try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Assuming project root is two levels up from this utils directory
    const envPath = path.resolve(__dirname, "../../.env");
    dotenv.config({ path: envPath });
} catch (e) {
    // Non-fatal; we'll validate API_BASE next
    printDebugMessage(`dotenv initialization warning: ${e.message}`);
}

export const API_BASE = process.env.API_BASE || "";

if (!API_BASE) {
    // Fail fast so callers don't make malformed requests
    throw new Error("API_BASE is not defined. Ensure .env contains API_BASE and file is loaded before imports.");
}


export function validateCall(request, expectedParams, expectedPaths, endpointName) {
    printDebugMessage(`Calling endpoint: ${endpointName}`);
    if (!CURRENT_SESSION) {
        throw new Error("Not authenticated");
    }
    for (const param of expectedParams) {
        if (!request.body.hasOwnProperty(param)) {
            throw new Error(`Missing required parameter: ${param}`);
        }
    }

}

export async function sendCall(path, payload, manual=false) {
    try{
        if (!API_BASE || API_BASE.length === 0) {
            throw new Error("API_BASE is not defined");
        }
        const url = `${API_BASE || ''}${path || ''}`;
        const headers = {
            ...authHeaders(),
            "Content-Type": "application/json",
            "Accept": "application/json"
        };
        
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            redirect: manual ? 'manual' : 'follow'
        });
        return response;
    } catch (err) {
        printDebugMessage(`Error sending call to ${path}: ${err.message}`);
        throw err;
    }
}

export async function handleSetCookies(response) {
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
        const pairs = parseSetCookieHeader(setCookie);
        setCookies(mergeCookiePairs(getCookies(), pairs));
    }
}