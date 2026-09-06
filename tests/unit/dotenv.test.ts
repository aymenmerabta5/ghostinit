import { describe, expect, test } from "bun:test";
import {
  canonicalDotenvFields,
  dotenvFieldsEqual,
  isDotenvDocumentationFileName,
  isRuntimeDotenvFileName,
  parseDotenvAssignments,
  parseDotenvLine,
} from "../../src/lib/dotenv";

describe("dotenv semantic comparison", () => {
  test("ignores comments, quoting, exports, line endings, and assignment order", () => {
    const root = '# operator note\r\nAPP_NAME="Ghost Init"\r\nexport API_URL=https://api.test\r\n';
    const mirror = "API_URL='https://api.test'\nAPP_NAME=Ghost Init # mirror note\n";

    expect(dotenvFieldsEqual(root, mirror)).toBe(true);
    expect(canonicalDotenvFields(root)).toBe(canonicalDotenvFields(mirror));
  });

  test("requires the exact same key set and effective values", () => {
    expect(dotenvFieldsEqual("A=1\nB=2\n", "A=1\n")).toBe(false);
    expect(dotenvFieldsEqual("A=1\nB=2\n", "A=1\nB=3\n")).toBe(false);
  });

  test("matches dotenv last-assignment semantics without hiding conflicts", () => {
    expect([...parseDotenvAssignments("A=old\nA=current\n")]).toEqual([["A", "current"]]);
    expect(dotenvFieldsEqual("A=old\nA=current\n", "A=current\n")).toBe(true);
    expect(dotenvFieldsEqual("A=current\nA=old\n", "A=current\n")).toBe(false);
    expect(parseDotenvLine("export TOKEN='quoted value' # comment")).toEqual({
      key: "TOKEN",
      value: "quoted value",
    });
  });

  test("distinguishes runtime dotenv files from documentation templates", () => {
    for (const name of [".env", ".env.local", ".env.production", ".EnV.StAgInG"]) {
      expect(isRuntimeDotenvFileName(name), name).toBe(true);
    }
    for (const name of [
      ".env.example",
      ".env.production.example",
      ".env.template",
      ".env.production.local.template",
    ]) {
      expect(isRuntimeDotenvFileName(name), name).toBe(false);
      expect(isDotenvDocumentationFileName(name), name).toBe(true);
    }
    expect(isRuntimeDotenvFileName("env.production")).toBe(false);
  });
});
