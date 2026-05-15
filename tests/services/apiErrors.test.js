import { describe, it, expect } from "vitest";
import { classifyException } from "../../server/services/apiErrors.js";
import { EXCEPTION_CODES } from "../../server/constants.js";

describe("classifyException", () => {
  it("returns 'threeDS' when exception.number === 4294", () => {
    expect(classifyException({ exception: { number: EXCEPTION_CODES.THREE_DS_REQUIRED } })).toBe(
      "threeDS"
    );
  });

  it("returns 'cancelled' when exception.number === 2018", () => {
    expect(classifyException({ exception: { number: EXCEPTION_CODES.PAYMENT_CANCELLED } })).toBe(
      "cancelled"
    );
  });

  it("returns 'threeDS' for a raw string that contains 4294 (legacy text body)", () => {
    expect(classifyException('{"some":"thing 4294"}')).toBe("threeDS");
  });

  it("returns 'threeDS' for a body whose stringified form contains 4294", () => {
    expect(classifyException({ nested: { warning: "code 4294 raised" } })).toBe("threeDS");
  });

  it("returns 'other' for unrelated exceptions", () => {
    expect(classifyException({ exception: { number: 9999 } })).toBe("other");
  });

  it("returns 'other' for null / undefined / empty input", () => {
    expect(classifyException(null)).toBe("other");
    expect(classifyException(undefined)).toBe("other");
    expect(classifyException("")).toBe("other");
    expect(classifyException({})).toBe("other");
  });
});
