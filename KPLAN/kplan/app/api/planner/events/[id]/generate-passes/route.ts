import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlannerSession } from '@/lib/server/planner';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

const ParamsSchema = z.object({
  id: z.string().uuid('Invalid event ID'),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Verify session
    await requirePlannerSession();

    // Parse and validate params
    const params = await context.params;
    const { id: eventId } = ParamsSchema.parse(params);

    const supabase = supabaseAdmin();

    // Fetch all guests with rsvp_status = 'yes' and not deleted
    const { data: guests, error: guestError } = await supabase
      .from('guests')
      .select('id')
      .eq('event_id', eventId)
      .eq('rsvp_status', 'yes')
      .is('deleted_at', null);

    if (guestError) throw guestError;

    const guestIds = guests?.map((g) => g.id) || [];

    if (guestIds.length === 0) {
      return NextResponse.json({
        generated: 0,
        alreadyHad: 0,
        total: 0,
      });
    }

    // Fetch all existing active passes for these guests
    const { data: existingPasses, error: passError } = await supabase
      .from('qr_passes')
      .select('guest_id')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .in('guest_id', guestIds);

    if (passError) throw passError;

    const guestIdsWithPasses = new Set(
      existingPasses?.map((p) => p.guest_id) || []
    );
    const guestsNeedingPasses = guestIds.filter(
      (id) => !guestIdsWithPasses.has(id)
    );

    // Generate new passes for guests without active ones
    const newPasses = guestsNeedingPasses.map((guestId) => ({
      event_id: eventId,
      guest_id: guestId,
      qr_token: randomUUID(),
      is_active: true,
      issued_at: new Date().toISOString(),
    }));

    if (newPasses.length === 0) {
      return NextResponse.json({
        generated: 0,
        alreadyHad: guestIds.length,
        total: guestIds.length,
      });
    }

    const { data: created, error: insertError } = await supabase
      .from('qr_passes')
      .insert(newPasses)
      .select();

    if (insertError) throw insertError;

    return NextResponse.json({
      generated: created?.length || 0,
      alreadyHad: guestIdsWithPasses.size,
      total: guestIds.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Generate passes error:', error);
    return NextResponse.json(
      { error: 'Failed to generate passes' },
      { status: 500 }
    );
  }
}
