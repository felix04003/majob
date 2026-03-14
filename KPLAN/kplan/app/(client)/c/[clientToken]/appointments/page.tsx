import ClientAppointmentsView from "./client-appointments-view"

export default async function ClientAppointmentsPage({ params }: { params: Promise<{ clientToken: string }> }) {
  const { clientToken } = await params
  return <ClientAppointmentsView clientToken={clientToken} />
}
