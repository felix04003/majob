import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlannerSession } from '@/lib/server/planner';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

const ParamsSchema = z.object({
  passId: z.string().uuid('Invalid pass ID'),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ passId: string }> }
) {
  try {
    // Verify session
    await requirePlannerSession();

    // Parse and validate params
    const params = await context.params;
    const { passId } = ParamsSchema.parse(params);

    const supabase = supabaseAdmin();

    // Fetch the existing pass
    const { data: existingPass, error: fetchError } = await supabase
      .from('qr_passes')
      .select('id, event_id, guest_id')
      .eq('id', passId)
      .single();

    if (fetchError) throw fetchError;

    if (!existingPass) {
      return NextResponse.json(
        { error: 'Pass not found' },
        { status: 404 }
      );
    }

    // Revoke the old pass
    const { error: revokeError } = await supabase
      .from('qr_passes')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', passId);

    if (revokeError) throw revokeError;

    // Create a new pass
    const { data: newPass, error: createError } = await supabase
      .from('qr_passes')
      .insert({
        event_id: existingPass.event_id,
        guest_id: existingPass.guest_id,
        qr_token: randomUUID(),
        is_active: true,
        issued_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) throw createError;

    return NextResponse.json({
      oldPassId: passId,
      newPass,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Regenerate pass error:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate pass' },
      { status: 500 }
    );
  }
}
