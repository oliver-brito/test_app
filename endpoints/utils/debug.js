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