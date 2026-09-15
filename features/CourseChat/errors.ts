export type ChatOperation = 'send' | 'resume' | 'history' | 'load' | 'delete' | 'archive';

export type ChatError = `${ChatOperation}Failed` | 'notConfigured' | 'notAuthenticated'
  | 'accessDenied' | 'notFound' | 'rateLimited' | 'contextUnavailable' | 'secretDetected'
  | 'invalidQuestion' | 'unavailable' | 'noResponse' | 'interrupted';

/** Response prose and transport diagnostics are never rendered in the drawer. */
export async function chatResponseError(response: Response, operation: ChatOperation): Promise<ChatError> {
  const body: unknown = await response.json().catch(() => null);
  const code = body && typeof body === 'object' && 'error' in body ? body.error : null;
  switch (code) {
    case 'not_configured': return 'notConfigured';
    case 'context_unavailable': return 'contextUnavailable';
    case 'secret_detected': return 'secretDetected';
    case 'invalid_json':
    case 'validation_failed': return 'invalidQuestion';
    case 'rate_limited': return 'rateLimited';
  }
  switch (response.status) {
    case 401: return 'notAuthenticated';
    case 403: return 'accessDenied';
    case 404: return 'notFound';
    case 429: return 'rateLimited';
    case 503: return 'unavailable';
    default: return `${operation}Failed`;
  }
}
