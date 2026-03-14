import DayOfDashboard from "./dayof-dashboard"

export default async function DayOfEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <DayOfDashboard eventId={eventId} />
}
