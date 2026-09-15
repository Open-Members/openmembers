// The middleware (next-intl) handles routing from / to /[locale]/
// This file is unreachable in normal operation but kept as a fallback.
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/dashboard');
}
