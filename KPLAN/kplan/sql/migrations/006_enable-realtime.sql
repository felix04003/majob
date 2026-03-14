-- Enable Supabase Realtime on key tables
-- This allows the client to subscribe to Postgres changes via WebSocket.
--
-- Run this in the Supabase SQL Editor or via the Dashboard > Database > Replication tab.
-- Note: Realtime must be enabled per-table in Supabase.

-- Enable realtime for notifications (new notifications + read status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable realtime for guest_changes (new client requests + approval/rejection)
ALTER PUBLICATION supabase_realtime ADD TABLE guest_changes;

-- Enable realtime for checkins (real-time arrival tracking on day-of)
ALTER PUBLICATION supabase_realtime ADD TABLE checkins;

-- Enable realtime for tasks (day-of checklist status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- Enable realtime for guests (RSVP status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE guests;

-- Enable realtime for events (new events, updates)
ALTER PUBLICATION supabase_realtime ADD TABLE events;

-- Enable realtime for appointments (calendar updates)
ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
