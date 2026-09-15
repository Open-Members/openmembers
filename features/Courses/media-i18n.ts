export const videoErrorCodes = [
  'unauthenticated',
  'forbidden',
  'unavailable',
  'failed',
] as const;

export type VideoErrorCode = (typeof videoErrorCodes)[number];
