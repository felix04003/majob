import PassEnhanced from "./pass-enhanced"

export default async function PassPage({ params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params
  return <PassEnhanced inviteToken={inviteToken} />
}


