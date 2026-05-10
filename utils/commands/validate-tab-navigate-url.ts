/**
 * Validates a tab.navigate URL string: non-empty after trim, parseable, http(s) only.
 */

export function validateTabNavigateUrl(urlInput: string | undefined): URL {
  const url = urlInput?.trim();
  if (!url) {
    throw new Error("Missing url");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("Only http(s) URLs are allowed");
  }
  return parsed;
}
