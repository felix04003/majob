import { getTemplate } from "@/lib/invitation-templates"

interface InvitationEmailParams {
  guestFirstName: string
  guestLastName: string
  eventTitle: string
  eventDate: string
  venueName: string | null
  venueAddress: string | null
  inviteUrl: string
  templateId: string
  customMessage?: string | null
}

export function buildInvitationEmailHtml(params: InvitationEmailParams): string {
  const {
    guestFirstName,
    guestLastName,
    eventTitle,
    eventDate,
    venueName,
    venueAddress,
    inviteUrl,
    templateId,
    customMessage,
  } = params

  // Map template colors to inline CSS hex colors for email compatibility
  const colorMap: Record<string, { primary: string; accent: string; bg: string; text: string }> = {
    "elegant-classic": { primary: "#b8860b", accent: "#d4a843", bg: "#fffdf5", text: "#1a1a1a" },
    "romantic-rose": { primary: "#be185d", accent: "#ec4899", bg: "#fff1f2", text: "#1a1a1a" },
    "champetre-vert": { primary: "#4d7c0f", accent: "#84cc16", bg: "#f7fdf4", text: "#1a1a1a" },
    "boheme-terracotta": { primary: "#c2410c", accent: "#ea580c", bg: "#fff7ed", text: "#1a1a1a" },
    "tropical-paradise": { primary: "#0891b2", accent: "#06b6d4", bg: "#f0fdfa", text: "#1a1a1a" },
    "garden-lavande": { primary: "#7c3aed", accent: "#a78bfa", bg: "#faf5ff", text: "#1a1a1a" },
    "modern-minimal": { primary: "#18181b", accent: "#52525b", bg: "#fafafa", text: "#18181b" },
    "geometric-blush": { primary: "#be185d", accent: "#f472b6", bg: "#fdf2f8", text: "#1a1a1a" },
    "scandinave-frost": { primary: "#1d4ed8", accent: "#60a5fa", bg: "#eff6ff", text: "#1a1a1a" },
    "art-deco-gatsby": { primary: "#b8860b", accent: "#fbbf24", bg: "#1a1a1a", text: "#ffffff" },
    "royal-navy": { primary: "#1e3a5f", accent: "#d4a843", bg: "#f0f4f8", text: "#1a1a1a" },
    "velvet-burgundy": { primary: "#881337", accent: "#be123c", bg: "#fff1f2", text: "#1a1a1a" },
    "dark-moody": { primary: "#7c3aed", accent: "#a855f7", bg: "#1a1a2e", text: "#ffffff" },
    "watercolor-sunset": { primary: "#ea580c", accent: "#f97316", bg: "#fff7ed", text: "#1a1a1a" },
    "pastel-rainbow": { primary: "#ec4899", accent: "#8b5cf6", bg: "#fdf4ff", text: "#1a1a1a" },
    "mediterraneen-azur": { primary: "#0369a1", accent: "#0ea5e9", bg: "#f0f9ff", text: "#1a1a1a" },
    "vintage-sepia": { primary: "#92400e", accent: "#b45309", bg: "#fffbeb", text: "#1a1a1a" },
    "orient-dore": { primary: "#b8860b", accent: "#059669", bg: "#f0fdf4", text: "#1a1a1a" },
  }

  const colors = colorMap[templateId] ?? colorMap["elegant-classic"]!

  const formattedDate = new Date(eventDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const locationHtml = venueName || venueAddress
    ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
          <strong style="color: ${colors.text};">Lieu</strong><br/>
          <span style="color: #666;">${venueName ?? ""}${venueName && venueAddress ? " — " : ""}${venueAddress ?? ""}</span>
        </td>
      </tr>`
    : ""

  const messageHtml = customMessage
    ? `
      <tr>
        <td style="padding: 20px 30px; background: ${colors.bg}; border-radius: 8px; margin: 16px 0;">
          <p style="color: ${colors.text}; font-style: italic; margin: 0; line-height: 1.6;">
            "${customMessage}"
          </p>
        </td>
      </tr>
      <tr><td style="height: 16px;"></td></tr>`
    : ""

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invitation — ${eventTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Georgia, 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background: ${colors.primary}; padding: 40px 30px; text-align: center;">
              <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 2px;">
                Vous êtes invité(e)
              </p>
              <h1 style="color: #ffffff; font-size: 28px; margin: 0; line-height: 1.3;">
                ${eventTitle}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 30px;">
              <p style="color: ${colors.text}; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Cher(ère) <strong>${guestFirstName} ${guestLastName}</strong>,
              </p>
              <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
                Nous avons le plaisir de vous inviter à cet événement. Veuillez confirmer votre présence en cliquant sur le bouton ci-dessous.
              </p>

              ${messageHtml}

              <!-- Event Details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
                    <strong style="color: ${colors.text};">Date</strong><br/>
                    <span style="color: #666;">${formattedDate}</span>
                  </td>
                </tr>
                ${locationHtml}
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0;">
                    <a href="${inviteUrl}" style="display: inline-block; background: ${colors.primary}; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: bold; letter-spacing: 0.5px;">
                      Confirmer ma présence
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px; line-height: 1.5;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
                <a href="${inviteUrl}" style="color: ${colors.accent}; word-break: break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: ${colors.bg}; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 11px; margin: 0;">
                Cette invitation est personnelle et ne peut être transférée.<br/>
                Envoyé via <a href="https://kplan.app" style="color: ${colors.accent}; text-decoration: none;">Kplan</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildInvitationEmailSubject(eventTitle: string): string {
  return `Invitation — ${eventTitle}`
}
