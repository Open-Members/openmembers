export const commentErrorCodes = [
  'notAuthenticated', 'accessDenied', 'invalidInput', 'contentRequired',
  'contentTooLong', 'commentUnavailable', 'saveFailed', 'deleteFailed',
  'pinFailed', 'loadFailed',
] as const;

export type CommentErrorCode = typeof commentErrorCodes[number];

export function commentErrorCode(value: unknown, fallback: CommentErrorCode): CommentErrorCode {
  return typeof value === 'string' && commentErrorCodes.includes(value as CommentErrorCode)
    ? value as CommentErrorCode
    : fallback;
}
