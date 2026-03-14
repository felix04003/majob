import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlannerSession } from '@/lib/server/planner';
import { supabaseAdmin } from '@/lib/supabase/admin';

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

    // Revoke the pass
    const { data: updatedPass, error } = await supabase
      .from('qr_passes')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', passId)
      .select()
      .single();

    if (error) throw error;

    if (!updatedPass) {
      return NextResponse.json(
        { error: 'Pass not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ pass: updatedPass });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Revoke pass error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke pass' },
      { status: 500 }
    );
  }
}
