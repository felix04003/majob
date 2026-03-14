import InviteEnhanced from "./invite-enhanced"

export default async function InvitePage({ params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params
  return <InviteEnhanced inviteToken={inviteToken} />
}


