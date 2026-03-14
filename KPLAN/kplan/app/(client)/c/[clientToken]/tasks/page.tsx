import ClientTasksView from "./client-tasks-view"

export default async function ClientTasksPage({ params }: { params: Promise<{ clientToken: string }> }) {
  const { clientToken } = await params
  return <ClientTasksView clientToken={clientToken} />
}
