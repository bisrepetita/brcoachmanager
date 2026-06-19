export async function sendNotification(params: {
  userIds: string[]
  title: string
  body: string
  link?: string
}): Promise<void> {
  try {
    await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } catch {
    // Notifications non critiques — on ignore silencieusement
  }
}
