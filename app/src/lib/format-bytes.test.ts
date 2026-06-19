import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatBytes(12656838)).toBe("12.1 MB");
  });
});
