import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePlannerSession } from "@/lib/server/planner"
import { supabaseAdmin } from "@/lib/supabase/admin"

const Params = z.object({ id: z.string().uuid() })

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  // Validate file type
  const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Type de fichier non supporté. Utilisez PNG, JPG, WebP ou SVG." }, { status: 400 })
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 5 Mo)" }, { status: 400 })
  }

  const db = supabaseAdmin()
  const eventId = parsed.data.id

  // Verify event exists
  const { data: event, error: ee } = await db.from("events").select("id").eq("id", eventId).single()
  if (ee || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  // Generate unique filename
  const ext = file.name.split(".").pop() || "png"
  const fileName = `${eventId}/${Date.now()}.${ext}`

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await db.storage
    .from("invitation-images")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Get public URL
  const { data: urlData } = db.storage.from("invitation-images").getPublicUrl(fileName)
  const publicUrl = urlData.publicUrl

  // Update event with image URL
  const { error: updateError } = await db
    .from("events")
    .update({ invitation_image_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", eventId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ url: publicUrl })
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePlannerSession()
  if (!gate.ok) return gate.response

  const raw = await context.params
  const parsed = Params.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const db = supabaseAdmin()

  // Clear the image URL
  const { error } = await db
    .from("events")
    .update({ invitation_image_url: null, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
