// Helpers for working with av-avon response bodies.

/**
 * @typedef {Object} ApiCallMetadata
 * @property {string} method
 * @property {string} endpoint
 * @property {string} path
 * @property {string} title
 * @property {number} status
 * @property {number} duration
 * @property {{ body: object, timestamp: string }} request
 * @property {any}    response
 */

/**
 * @typedef {Object} AvResult
 * @property {Response}        response
 * @property {any}             data
 * @property {ApiCallMetadata} apiCallMetadata
 */

/** Parse a fetch Response as JSON, falling back to raw text on failure. */
export async function parseResponse(response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * av-avon wraps successful payloads as { data: { [field]: ... } }. Pull a
 * named field out of that envelope, returning undefined when absent.
 */
export function unwrap(data, field) {
  return data?.data?.[field];
}
