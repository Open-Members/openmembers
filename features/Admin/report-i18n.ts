export const knownEmailEventTypes = [
  'sent',
  'delivered',
  'hard_bounce',
  'soft_bounce',
  'blocked',
  'invalid',
  'spam',
  'complaint',
  'opened',
  'clicked',
  'unsubscribed',
  'delayed',
] as const;

export type KnownEmailEventType = (typeof knownEmailEventTypes)[number];

export const emailDeliveryIssueTypes = [
  'hard_bounce',
  'soft_bounce',
  'blocked',
  'invalid',
  'spam',
  'complaint',
] as const;

export type EmailDeliveryIssueType = (typeof emailDeliveryIssueTypes)[number];

export type EmailDeliverySummaryCopy = Record<
  EmailDeliveryIssueType | 'unknown',
  string
>;

export function isKnownEmailEventType(
  value: string,
): value is KnownEmailEventType {
  return knownEmailEventTypes.some((eventType) => eventType === value);
}

export function isEmailDeliveryIssueType(
  value: string,
): value is EmailDeliveryIssueType {
  return emailDeliveryIssueTypes.some((eventType) => eventType === value);
}

export function getEmailDeliverySummary(
  eventType: string,
  copy: EmailDeliverySummaryCopy,
): string {
  return isEmailDeliveryIssueType(eventType)
    ? copy[eventType]
    : copy.unknown;
}
