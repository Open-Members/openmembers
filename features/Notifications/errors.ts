export const notificationErrorCodes = ['invalidInput', 'notAuthenticated', 'unavailable', 'readFailed', 'readAllFailed', 'deleteFailed', 'loadFailed', 'countFailed'] as const;
export type NotificationErrorCode = typeof notificationErrorCodes[number];
export function notificationErrorCode(value: unknown, fallback: NotificationErrorCode): NotificationErrorCode {
  return typeof value === 'string' && notificationErrorCodes.includes(value as NotificationErrorCode) ? value as NotificationErrorCode : fallback;
}
