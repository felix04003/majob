import { describe, it, expect } from "vitest"
import { cn } from "@/lib/utils"

describe("cn (classNames merger)", () => {
  it("returns empty string for no args", () => {
    expect(cn()).toBe("")
  })

  it("merges simple class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2")
  })

  it("handles conditional classes", () => {
    const isActive = true
    const isDisabled = false
    expect(cn("base", isActive && "active", isDisabled && "disabled")).toBe(
      "base active"
    )
  })

  it("resolves tailwind conflicts (last wins)", () => {
    const result = cn("px-4", "px-6")
    expect(result).toBe("px-6")
  })

  it("resolves tailwind color conflicts", () => {
    const result = cn("bg-red-500", "bg-blue-500")
    expect(result).toBe("bg-blue-500")
  })

  it("handles undefined and null gracefully", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b")
  })

  it("handles arrays", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c")
  })
})
