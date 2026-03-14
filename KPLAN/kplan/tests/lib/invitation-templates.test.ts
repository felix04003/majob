import { describe, it, expect } from "vitest"
import {
  templates,
  getTemplate,
  categoryLabels,
  type InvitationTemplate,
} from "@/lib/invitation-templates"

describe("invitation-templates", () => {
  describe("templates array", () => {
    it("contains at least 10 templates", () => {
      expect(templates.length).toBeGreaterThanOrEqual(10)
    })

    it("all templates have unique ids", () => {
      const ids = templates.map((t) => t.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it("all templates have required fields", () => {
      const requiredFields: (keyof InvitationTemplate)[] = [
        "id",
        "name",
        "category",
        "preview",
        "bgGradient",
        "primaryColor",
        "secondaryColor",
        "titleFont",
        "bodyFont",
        "qrDark",
        "qrLight",
      ]

      for (const t of templates) {
        for (const field of requiredFields) {
          expect(t[field], `${t.id} missing ${field}`).toBeTruthy()
        }
      }
    })

    it("all categories are valid", () => {
      const validCategories = ["classique", "nature", "moderne", "luxe", "créatif"]
      for (const t of templates) {
        expect(validCategories).toContain(t.category)
      }
    })

    it("qrDark is a valid hex color", () => {
      for (const t of templates) {
        expect(t.qrDark).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    })

    it("qrLight is a valid hex color", () => {
      for (const t of templates) {
        expect(t.qrLight).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    })
  })

  describe("getTemplate", () => {
    it("returns the correct template by id", () => {
      const t = getTemplate("elegant-classic")
      expect(t.id).toBe("elegant-classic")
      expect(t.name).toBe("Élégant Classique")
    })

    it("returns fallback (first template) for unknown id", () => {
      const t = getTemplate("does-not-exist")
      expect(t.id).toBe(templates[0].id)
    })

    it("returns fallback for empty string", () => {
      const t = getTemplate("")
      expect(t.id).toBe(templates[0].id)
    })
  })

  describe("categoryLabels", () => {
    it("has labels for all categories used in templates", () => {
      const usedCategories = [...new Set(templates.map((t) => t.category))]
      for (const cat of usedCategories) {
        expect(categoryLabels[cat], `Missing label for ${cat}`).toBeTruthy()
      }
    })
  })
})
