import dotenv from "dotenv"; // Ensure .env variables are loaded even if this file is imported before server bootstrap
import { CURRENT_SESSION, getApiBase } from "../utils/sessionStore.js";
import { printDebugMessage, logApiCall } from "../utils/debug.js";
import { authHeaders } from "../utils/authHeaders.js";
import { parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";
import { getCookies, setCookies } from "../utils/sessionStore.js";
import path from "path";
import { fileURLToPath } from "url";
import { ENDPOINTS } from "../../public/js/endpoints.js";
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

// Fallback API_BASE from .env (used only if user hasn't logged in with custom API base)
export const FALLBACK_API_BASE = process.env.API_BASE || "";

/**
 * Get the current API base URL from session (user's login input) or fallback to .env
 */
export function getActiveApiBase() {
    return getApiBase() || FALLBACK_API_BASE;
}

// Backward compatibility: API_BASE getter
export function API_BASE() {
    return getActiveApiBase();
}


export function validateCall(request, expectedParams, expectedPaths, endpointName) {
    printDebugMessage(`Calling endpoint: ${endpointName}`);
    const apiBase = getActiveApiBase();
    if (!apiBase || apiBase.length === 0) {
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
        const apiBase = getActiveApiBase();
        if (!apiBase || apiBase.length === 0) {
            throw new Error("API_BASE is not defined");
        }
        const url = `${apiBase}${path || ''}`;
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

export function isGettingGatewayConfiguration(data) {
    console.log(`Checking if response indicates getting gateway configuration: ${JSON.stringify(data)}`);
    try {
        const source = typeof data === 'string' ? data : JSON.stringify(data || '');
        const codePresent = data?.exception?.number === 4294;
        if (codePresent) return true;
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
/**
 * Generates a descriptive title for an API call based on the payload
 * @param {object} payload - The request payload
 * @returns {string} - Descriptive title for the API call
 */
function generateApiCallTitle(payload) {
    // Check if there are actions with methods
    if (payload.actions && Array.isArray(payload.actions) && payload.actions.length > 0) {
        const methods = payload.actions
            .map(action => action.method)
            .filter(method => method)
            .join(', ');
        if (methods) return methods;
    }

    // If no actions but there's a get array, show "get item1, item2, ..."
    if (payload.get && Array.isArray(payload.get) && payload.get.length > 0) {
        const items = payload.get.join(', ');
        return `get ${items}`;
    }

    // If there's a set object, show "set field1, field2, ..."
    if (payload.set && typeof payload.set === 'object' && Object.keys(payload.set).length > 0) {
        const fields = Object.keys(payload.set).join(', ');
        return `set ${fields}`;
    }

    // Default fallback
    return 'API call';
}

export async function makeApiCall(path, payload, manual = false) {
    const startTime = Date.now();
    const apiBase = getActiveApiBase();
    const fullUrl = `${apiBase}${path}`;

    const response = await sendCall(path, payload, manual);
    await handleSetCookies(response);
    const data = await parseResponse(response);

    const duration = Date.now() - startTime;

    // Log the response
    logApiCall(path, { body: payload }, response, data);

    // Generate descriptive title for the API call
    const title = generateApiCallTitle(payload);

    // Include backend API call metadata for frontend logging
    const apiCallMetadata = {
        method: 'POST',
        endpoint: fullUrl,
        path: path,
        title: title,
        status: response.status,
        duration: duration,
        request: {
            body: payload,
            timestamp: new Date().toISOString()
        },
        response: data
    };

    return { response, data, apiCallMetadata };
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
 * @param {boolean} options.checkGatewayConfig - Check for gateway configuration requirement
 * @returns {Promise<{response: Response, data: any, requires3ds?: boolean} | null>}
 */
export async function makeApiCallWithErrorHandling(
    res,
    path,
    payload,
    errorMessage,
    options = {}
) {
    const { manual = false, check3ds = false, checkGatewayConfig = false } = options;

    const { response, data, apiCallMetadata } = await makeApiCall(path, payload, manual);

    if (!response.ok) {
        console.log(`checkGatewayConfig: ${checkGatewayConfig}, check3ds: ${check3ds}`);
        // Check for gateway configuration requirement if enabled
        if (checkGatewayConfig && isGettingGatewayConfiguration(data)) {
            printDebugMessage("Getting gateway configuration");
            return { response, data, apiCallMetadata, isGettingGatewayConfiguration: true };

        }
        // Check for 3DS requirement if enabled
        if (check3ds && is3dsRequired(data)) {
            printDebugMessage("3DS authentication required");
            return { response, data, apiCallMetadata, requires3ds: true };
        }

        handleApiError(res, response, data, errorMessage, path, payload);
        return null;
    }

    return { response, data, apiCallMetadata };
}