/** Server diagnostics never become product copy; only known codes are translated. */
export const contentErrorCodes = [
  'operationFailed',
  'invalidInput',
  'notFound',
  'loadFailed',
  'uploadFailed',
  'materialInvalid',
  'systemCollection',
  'manualCollection',
  'titleRequired',
  'nameRequired',
  'slugInvalid',
  'thresholdInvalid',
  'attemptsInvalid',
  'questionInvalid',
  'liveCourses',
  'liveTitle',
  'liveDuration',
  'liveUrl',
  'liveDate',
  'liveDescription',
] as const;

const codes = new Set<string>(contentErrorCodes);
export function contentError(
  error: unknown,
  translate: (key: string) => string,
): string {
  const code =
    typeof error === 'string' && codes.has(error) ? error : 'operationFailed';
  return translate(`errors.${code}`);
}
