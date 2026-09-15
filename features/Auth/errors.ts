import type { ZodIssue } from 'zod';

/** Product message keys, never provider or validation prose. */
export function authValidationError(issues: ZodIssue[], signingIn = false): string {
  switch (issues[0]?.path[0]) {
    case 'email': return 'invalidEmail';
    case 'password': return signingIn ? 'passwordRequired' : 'passwordTooShort';
    case 'displayName': return 'invalidName';
    default: return 'invalidInput';
  }
}

export function authProviderError(
  error: { code?: string },
  operation: 'signIn' | 'signUp' | 'oauth' | 'passwordUpdate',
): string {
  const fallback = `${operation}Failed`;
  switch (error.code) {
    case 'invalid_credentials': return operation === 'signIn' ? 'invalidCredentials' : fallback;
    case 'email_not_confirmed': return 'emailNotConfirmed';
    case 'email_address_invalid': return 'invalidEmail';
    case 'email_exists':
    case 'user_already_exists': return operation === 'signUp' ? 'emailAlreadyRegistered' : fallback;
    case 'weak_password': return 'weakPassword';
    case 'same_password': return 'samePassword';
    case 'session_not_found':
    case 'session_expired': return 'notAuthenticated';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return operation === 'signIn' ? 'tooManySignIns'
        : operation === 'signUp' ? 'tooManySignUps' : fallback;
    default: return fallback;
  }
}
