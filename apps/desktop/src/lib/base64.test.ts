import { describe, expect, it } from "vitest";
import { arrayBufferToBase64 } from "./base64";

describe("arrayBufferToBase64", () => {
  it("encodes a known byte vector", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    expect(arrayBufferToBase64(bytes.buffer)).toBe("SGVsbG8=");
  });

  it("round-trips arbitrary bytes across the chunk boundary", () => {
    const size = 0x8000 * 2 + 123;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) bytes[i] = (i * 31 + 7) % 256;
    const decoded = Uint8Array.from(atob(arrayBufferToBase64(bytes.buffer)), (c) =>
      c.charCodeAt(0),
    );
    expect(decoded).toEqual(bytes);
  });
});
