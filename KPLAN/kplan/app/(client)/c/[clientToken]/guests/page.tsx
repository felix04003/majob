import ClientGuestsClient from "./client-guests-client"

export default async function ClientGuestsPage({ params }: { params: Promise<{ clientToken: string }> }) {
  const { clientToken } = await params
  return <ClientGuestsClient clientToken={clientToken} />
}
