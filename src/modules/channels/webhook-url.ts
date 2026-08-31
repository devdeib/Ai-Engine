/**
 * Public channel-account webhook URL. Origin must be NEXT_PUBLIC_APP_URL.
 * Does not include secrets, organization ids, or destinations.
 */

export function channelAccountWebhookPath(accountId: string): string {
  return `/api/v1/channels/accounts/${accountId}/webhook`;
}

export function buildChannelWebhookUrl(
  origin: string,
  accountId: string
): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return `${normalizedOrigin}${channelAccountWebhookPath(accountId)}`;
}
