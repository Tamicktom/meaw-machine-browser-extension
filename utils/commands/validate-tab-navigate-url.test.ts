//* Libraries imports
import { describe, expect, test } from "vitest";

//* Local imports
import { validateTabNavigateUrl } from "./validate-tab-navigate-url";

describe("validateTabNavigateUrl", () => {
  test("throws Missing url for undefined", () => {
    expect(() => validateTabNavigateUrl(undefined)).toThrow("Missing url");
  });

  test("throws Missing url for empty or whitespace", () => {
    expect(() => validateTabNavigateUrl("")).toThrow("Missing url");
    expect(() => validateTabNavigateUrl("   ")).toThrow("Missing url");
  });

  test("throws Invalid URL for unparsable input", () => {
    expect(() => validateTabNavigateUrl("not a url")).toThrow("Invalid URL");
  });

  test("throws Only http(s) URLs are allowed for javascript: and file:", () => {
    expect(() => validateTabNavigateUrl("javascript:alert(1)")).toThrow("Only http(s) URLs are allowed");
    expect(() => validateTabNavigateUrl("file:///etc/passwd")).toThrow("Only http(s) URLs are allowed");
  });

  test("returns URL for valid http and https", () => {
    const http = validateTabNavigateUrl("http://example.com/path");
    expect(http.href).toBe("http://example.com/path");
    const https = validateTabNavigateUrl("https://example.com/");
    expect(https.protocol).toBe("https:");
  });
});
