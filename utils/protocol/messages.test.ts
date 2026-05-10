//* Libraries imports
import { describe, expect, test } from "bun:test";

//* Local imports
import { parseJsonEnvelope } from "./messages";

describe("parseJsonEnvelope", () => {
  test("returns envelope for valid minimal command JSON", () => {
    const raw = JSON.stringify({
      type: "command",
      command: {
        id: "c1",
        action: "tab.navigate",
        params: { url: "https://example.com" },
      },
    });
    const result = parseJsonEnvelope(raw);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("command");
    expect(result?.command.id).toBe("c1");
    expect(result?.command.action).toBe("tab.navigate");
    expect(result?.command.params).toEqual({ url: "https://example.com" });
  });

  test("returns null for invalid JSON", () => {
    expect(parseJsonEnvelope("not json")).toBeNull();
  });

  test("returns null for null root", () => {
    expect(parseJsonEnvelope("null")).toBeNull();
  });

  test("returns null for non-object root", () => {
    expect(parseJsonEnvelope('"string"')).toBeNull();
    expect(parseJsonEnvelope("42")).toBeNull();
    expect(parseJsonEnvelope("[]")).toBeNull();
  });

  test("returns null when type is not command", () => {
    const raw = JSON.stringify({
      type: "other",
      command: { id: "1", action: "tab.navigate", params: {} },
    });
    expect(parseJsonEnvelope(raw)).toBeNull();
  });

  test("returns null when command is missing or not an object", () => {
    expect(parseJsonEnvelope(JSON.stringify({ type: "command" }))).toBeNull();
    expect(parseJsonEnvelope(JSON.stringify({ type: "command", command: null }))).toBeNull();
    expect(parseJsonEnvelope(JSON.stringify({ type: "command", command: "x" }))).toBeNull();
  });

  test("returns null when command.id or command.action is not a string", () => {
    expect(
      parseJsonEnvelope(
        JSON.stringify({ type: "command", command: { id: 1, action: "a", params: {} } }),
      ),
    ).toBeNull();
    expect(
      parseJsonEnvelope(
        JSON.stringify({ type: "command", command: { id: "1", action: 2, params: {} } }),
      ),
    ).toBeNull();
  });

  test("returns null when params is missing or not an object", () => {
    expect(
      parseJsonEnvelope(JSON.stringify({ type: "command", command: { id: "1", action: "a" } })),
    ).toBeNull();
    expect(
      parseJsonEnvelope(
        JSON.stringify({ type: "command", command: { id: "1", action: "a", params: null } }),
      ),
    ).toBeNull();
    expect(
      parseJsonEnvelope(
        JSON.stringify({ type: "command", command: { id: "1", action: "a", params: [] } }),
      ),
    ).toBeNull();
    expect(
      parseJsonEnvelope(
        JSON.stringify({ type: "command", command: { id: "1", action: "a", params: "bad" } }),
      ),
    ).toBeNull();
  });
});
