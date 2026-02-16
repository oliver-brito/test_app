import dotenv from "dotenv"; // Ensure .env variables are loaded even if this file is imported before server bootstrap
import { CURRENT_SESSION } from "../utils/sessionStore.js";
import { printDebugMessage, logApiCall } from "../utils/debug.js";
import { authHeaders } from "../utils/authHeaders.js";
import { parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";
import { getCookies, setCookies } from "../utils/sessionStore.js";
import path from "path";
import { fileURLToPath } from "url";
import { ENDPOINTS } from "../../public/endpoints.js";
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
    if (!API_BASE || API_BASE.length === 0) {
        throw new Error("API_BASE is not defined");
    }
    if (!CURRENT_SESSION) {
        throw new Error("Not authenticated");
    }
    if (!expectedPaths) {
        throw new Error("No expected endpoint paths provided for validation");
    }
    for (const param of expectedParams) {
        if (!request.body.hasOwnProperty(param)) {
            throw new Error(`Missing required parameter: ${param}`);
        }
    }
    for (const pathKey of expectedPaths) {
        // it could be NAME_PATH or NAME
        var endpointName = ENDPOINTS[pathKey] || ENDPOINTS[pathKey.replace(/_PATH$/, '')]; 
        if (!endpointName) {
            throw new Error(`Missing required endpoint path: ${pathKey}`);
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

        // Log the request
        logApiCall(path, {
            url,
            method: "POST",
            headers,
            body: payload
        });

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

// Detect whether a response indicates 3DS (challenge) is required.
// Logic: original inline implementation checked if JSON string contains the warning code '4294'.
// This helper safely stringifies objects and falls back gracefully.
export function is3dsRequired(data) {
    try {
        const source = typeof data === 'string' ? data : JSON.stringify(data || '');
        const codePresent = data?.exception?.number === 4294;
        if (codePresent) return true;
        printDebugMessage(`Checking for 3DS requirement in response source: ${source}`);
        printDebugMessage(`Raw data object: ${JSON.stringify(data)}`);
        printDebugMessage(`Exception number: ${data?.exception?.number}`);
        printDebugMessage(`Exception details: ${JSON.stringify(data?.exception)}`);
        return source.includes('4294');
    } catch {
        return false;
    }
}

/**
 * Parses response text as JSON, falls back to raw text if parsing fails.
 * Eliminates the repeated pattern: const raw = await response.text(); let data; try { data = JSON.parse(raw); } catch { data = raw; }
 * @param {Response} response - Fetch API response object
 * @returns {Promise<any>} Parsed JSON or raw text
 */
export async function parseResponse(response) {
    const raw = await response.text();
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

/**
 * Complete API call with cookie handling and response parsing.
 * Combines sendCall + handleSetCookies + parseResponse into a single operation.
 * @param {string} path - API endpoint path
 * @param {object} payload - Request payload
 * @param {boolean} manual - Manual redirect flag (default: false)
 * @returns {Promise<{response: Response, data: any}>}
 */
export async function makeApiCall(path, payload, manual = false) {
    const response = await sendCall(path, payload, manual);
    await handleSetCookies(response);
    const data = await parseResponse(response);

    // Log the response
    logApiCall(path, { body: payload }, response, data);

    return { response, data };
}

/**
 * Standardized error response handler.
 * Returns structured error with request/response details for frontend debugging modal.
 * @param {object} res - Express response object
 * @param {Response} response - Fetch response
 * @param {any} data - Parsed response data
 * @param {string} errorMessage - Custom error message
 * @param {string} endpoint - The endpoint that was called
 * @param {object} requestPayload - The original request payload
 * @returns {object} Express JSON response
 */
export function handleApiError(res, response, data, errorMessage, endpoint = 'unknown', requestPayload = null) {
    printDebugMessage(`${errorMessage}: ${response.status}`);
    return res.status(response.status).json({
        error: errorMessage,
        message: errorMessage,
        status: response.status,
        endpoint: endpoint,
        request: requestPayload ? {
            endpoint: endpoint,
            payload: requestPayload,
            timestamp: new Date().toISOString()
        } : null,
        response: data,
        details: data,
        debugInfo: {
            timestamp: new Date().toISOString(),
            statusText: response.statusText || 'Unknown Error'
        }
    });
}

/**
 * Complete API call with automatic error handling.
 * Returns null if error occurred (response already sent to client).
 * Handles 3DS detection if check3ds option is enabled.
 * @param {object} res - Express response object
 * @param {string} path - API endpoint path
 * @param {object} payload - Request payload
 * @param {string} errorMessage - Error message for failures
 * @param {object} options - Optional settings
 * @param {boolean} options.manual - Manual redirect flag
 * @param {boolean} options.check3ds - Check for 3DS requirement
 * @returns {Promise<{response: Response, data: any, requires3ds?: boolean} | null>}
 */
export async function makeApiCallWithErrorHandling(
    res,
    path,
    payload,
    errorMessage,
    options = {}
) {
    const { manual = false, check3ds = false } = options;

    const { response, data } = await makeApiCall(path, payload, manual);

    if (!response.ok) {
        // Check for 3DS requirement if enabled
        if (check3ds && is3dsRequired(data)) {
            printDebugMessage("3DS authentication required");
            return { response, data, requires3ds: true };
        }

        handleApiError(res, response, data, errorMessage, path, payload);
        return null;
    }

    return { response, data };
}