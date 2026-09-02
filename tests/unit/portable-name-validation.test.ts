import { describe, expect, test } from "bun:test";
import {
  isWindowsReservedDeviceName,
  PORTABLE_NAME_MAX_UTF8_BYTES,
  portableNameUtf8Bytes,
} from "../../src/domain/project/choices.js";
import { validateArtifactName } from "../../src/lib/reserved.js";

describe("portable artifact-name validation", () => {
  test("rejects Windows device basenames case-insensitively, including extensions", () => {
    for (const name of [
      "con",
      "CON.txt",
      "prn",
      "Aux.json",
      "nul",
      "com1",
      "COM9.log",
      "lpt1",
      "LPT9.txt",
      "conin$",
      "CONOUT$.txt",
    ]) {
      expect(isWindowsReservedDeviceName(name), name).toBe(true);
      const result = validateArtifactName(name, "artifact name");
      expect(result.valid, name).toBe(false);
      if (!result.valid) expect(result.reason, name).toContain("Windows-reserved");
    }
    for (const name of ["console", "com0", "com10", "lpt0", "lpt10"]) {
      expect(isWindowsReservedDeviceName(name), name).toBe(false);
      expect(validateArtifactName(name, "artifact name").valid, name).toBe(true);
    }
  });

  test("enforces the portable component cap in UTF-8 bytes", () => {
    const maximum = "a".repeat(PORTABLE_NAME_MAX_UTF8_BYTES);
    expect(validateArtifactName(maximum, "artifact name").valid).toBe(true);
    const result = validateArtifactName(`${maximum}a`, "artifact name");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("UTF-8 bytes");

    const multibyte = "é".repeat(51);
    expect(portableNameUtf8Bytes(multibyte)).toBe(102);
    const multibyteResult = validateArtifactName(multibyte, "artifact name");
    expect(multibyteResult.valid).toBe(false);
    if (!multibyteResult.valid) expect(multibyteResult.reason).toContain("received 102");
  });
});
