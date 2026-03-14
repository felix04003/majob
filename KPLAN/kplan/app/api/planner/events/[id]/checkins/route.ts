import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlannerSession } from '@/lib/server/planner';
import { supabaseAdmin } from '@/lib/supabase/admin';

const ParamsSchema = z.object({
  id: z.string().uuid('Invalid event ID'),
});

export async function GET(
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

    // Fetch all checkins for this event
    const { data: checkins, error: checkinError } = await supabase
      .from('checkins')
      .select('*')
      .eq('event_id', eventId)
      .order('scanned_at', { ascending: false });

    if (checkinError) throw checkinError;

    // Fetch all guests for this event
    const { data: guests, error: guestError } = await supabase
      .from('guests')
      .select('id, first_name, last_name')
      .eq('event_id', eventId);

    if (guestError) throw guestError;

    // Build a map of guest id to guest info
    const guestMap = new Map(
      guests?.map((g) => [g.id, { first_name: g.first_name, last_name: g.last_name }]) || []
    );

    // Enrich checkins with guest names
    const enrichedCheckins = (checkins || []).map((checkin) => {
      const guest = guestMap.get(checkin.guest_id);
      return {
        ...checkin,
        guest_name: guest
          ? `${guest.first_name || ''} ${guest.last_name || ''}`.trim()
          : 'Unknown',
      };
    });

    // Count total guests with rsvp_status = 'yes' and deleted_at is null
    const { data: totalGuestsData, error: totalError } = await supabase
      .from('guests')
      .select('id', { count: 'exact' })
      .eq('event_id', eventId)
      .eq('rsvp_status', 'yes')
      .is('deleted_at', null);

    if (totalError) throw totalError;

    const totalGuests = totalGuestsData?.length || 0;

    // Count unique guests with valid checkins
    const validCheckins = (checkins || []).filter((c) => c.result === 'valid');
    const uniqueArrivedGuests = new Set(validCheckins.map((c) => c.guest_id));
    const arrived = uniqueArrivedGuests.size;

    // Calculate stats
    const pending = totalGuests - arrived;
    const rate = totalGuests > 0 ? arrived / totalGuests : 0;

    // Build guest list with arrival status for the Day-Of dashboard
    const { data: allGuests, error: allGuestsError } = await supabase
      .from('guests')
      .select('id, first_name, last_name, rsvp_status')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('last_name', { ascending: true });

    if (allGuestsError) throw allGuestsError;

    // Map: guest_id → earliest valid checkin timestamp
    const arrivalMap = new Map<string, string>();
    for (const c of validCheckins) {
      if (c.guest_id && !arrivalMap.has(c.guest_id)) {
        arrivalMap.set(c.guest_id, c.scanned_at);
      }
    }
    // Since checkins are ordered desc, the last entry per guest is the earliest
    // Reverse to get earliest first
    for (const c of [...validCheckins].reverse()) {
      if (c.guest_id) {
        arrivalMap.set(c.guest_id, c.scanned_at);
      }
    }

    const enrichedGuests = (allGuests || []).map((g) => ({
      id: g.id,
      first_name: g.first_name,
      last_name: g.last_name,
      rsvp_status: g.rsvp_status,
      arrived: uniqueArrivedGuests.has(g.id),
      arrived_at: arrivalMap.get(g.id) ?? null,
    }));

    return NextResponse.json({
      checkins: enrichedCheckins,
      guests: enrichedGuests,
      stats: {
        total_guests: totalGuests,
        arrived,
        pending,
        rate: Math.round(rate * 10000) / 10000,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Fetch checkins error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch checkins' },
      { status: 500 }
    );
  }
}
