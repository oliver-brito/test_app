// global debug variable
let DEBUG_MODE = true;
export function isDebugMode() {
  return DEBUG_MODE;
}
export function setDebugMode(value) {
  DEBUG_MODE = value;
}
export function printDebugMessage(message) {
  if (DEBUG_MODE) {
    console.log(message);
  }
}

/**
 * Log detailed API call information for debugging
 * @param {string} endpoint - The API endpoint being called
 * @param {object} request - The request payload
 * @param {object} response - The response object (optional)
 * @param {any} data - The parsed response data (optional)
 */
export function logApiCall(endpoint, request, response = null, data = null) {
  if (!DEBUG_MODE) return;

  console.log('\n========== API CALL DEBUG ==========');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  console.log('\n--- Request ---');
  console.log(JSON.stringify(request, null, 2));

  if (response) {
    console.log('\n--- Response ---');
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`OK: ${response.ok}`);

    if (data) {
      console.log('\n--- Response Data ---');
      console.log(JSON.stringify(data, null, 2));
    }
  }

  console.log('\n====================================\n');
}