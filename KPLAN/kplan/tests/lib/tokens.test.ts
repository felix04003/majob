import { describe, it, expect } from "vitest"
import { randomToken } from "@/lib/tokens"

describe("randomToken", () => {
  it("returns a non-empty string", () => {
    const token = randomToken()
    expect(token).toBeTruthy()
    expect(typeof token).toBe("string")
  })

  it("returns a base64url-safe string (no +, /, =)", () => {
    for (let i = 0; i < 20; i++) {
      const token = randomToken()
      expect(token).not.toMatch(/[+/=]/)
    }
  })

  it("defaults to 32 bytes → ~43 characters", () => {
    const token = randomToken()
    // 32 bytes → ceil(32 * 4/3) = 43 chars base64url (no padding)
    expect(token.length).toBe(43)
  })

  it("respects custom byte length", () => {
    const token16 = randomToken(16)
    const token24 = randomToken(24)
    // 16 bytes → 22 chars, 24 bytes → 32 chars
    expect(token16.length).toBe(22)
    expect(token24.length).toBe(32)
  })

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken()))
    expect(tokens.size).toBe(100)
  })
})
