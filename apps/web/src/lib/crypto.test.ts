import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, safeEqual } from "./crypto";

const key = Buffer.alloc(32, 7).toString("base64");
const otherKey = Buffer.alloc(32, 9).toString("base64");

describe("secret encryption", () => {
  it("round-trips and never repeats a ciphertext", async () => {
    const a = await encryptSecret("token-123", key, "conn-1");
    const b = await encryptSecret("token-123", key, "conn-1");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(await decryptSecret(a, key, "conn-1")).toBe("token-123");
  });

  it("rejects the wrong key, the wrong context and tampering", async () => {
    const env = await encryptSecret("token-123", key, "conn-1");
    await expect(decryptSecret(env, otherKey, "conn-1")).rejects.toThrow();
    await expect(decryptSecret(env, key, "conn-2")).rejects.toThrow();
    const tampered = env.slice(0, -2) + (env.endsWith("A") ? "BB" : "AA");
    await expect(decryptSecret(tampered, key, "conn-1")).rejects.toThrow();
  });

  it("rejects keys of the wrong length", async () => {
    await expect(encryptSecret("x", Buffer.alloc(16).toString("base64"), "c")).rejects.toThrow("32 bytes");
  });
});

describe("safeEqual", () => {
  it("compares exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
