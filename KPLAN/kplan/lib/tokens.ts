import crypto from "crypto"

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url")
}


