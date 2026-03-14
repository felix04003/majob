import { Resend } from "resend"

let resendClient: Resend | null = null

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!resendClient) resendClient = new Resend(apiKey)
  return resendClient
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend()
  if (!resend) {
    console.log("[email] RESEND_API_KEY not set — skipping email:", opts.subject, "→", opts.to)
    return { ok: false, error: "RESEND_API_KEY not configured" }
  }

  const fromEmail = process.env.KPLAN_FROM_EMAIL || "Kplan <noreply@kplan.app>"

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })

    if (error) {
      console.error("[email] Resend error:", error.message)
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[email] Send failed:", msg)
    return { ok: false, error: msg }
  }
}
