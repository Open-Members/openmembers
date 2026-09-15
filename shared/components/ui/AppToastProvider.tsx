'use client';

import { Toast } from '@heroui/react';

/** Global toast region, mounted once in the root layout. */
export function AppToastProvider() {
  return (
    <Toast.Provider
      placement="bottom end"
      maxVisibleToasts={3}
      gap={10}
    />
  );
}
