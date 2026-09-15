import Image from 'next/image';
import { cn } from '@/shared/lib/utils';

/** Product artwork for the default identity; callers preserve installation overrides. */
export function DefaultBrandWordmark({
  className,
  compactOnMobile = false,
}: {
  className?: string;
  compactOnMobile?: boolean;
}) {
  return (
    <span className={cn('inline-block shrink-0', className)}>
      {compactOnMobile && (
        <Image
          src="/icon.svg"
          alt="Open Members"
          width={64}
          height={64}
          className="h-8 w-8 sm:hidden"
          data-no-dark-adjust
          unoptimized
        />
      )}
      <span className={compactOnMobile ? 'hidden sm:block' : 'block'}>
        <Image
          src="/brand/wordmark-dark.svg"
          alt="Open Members"
          width={690}
          height={100}
          className="h-auto w-full dark:hidden"
          data-no-dark-adjust
          unoptimized
        />
        <Image
          src="/brand/wordmark-light.svg"
          alt="Open Members"
          width={690}
          height={100}
          className="hidden h-auto w-full dark:block"
          data-no-dark-adjust
          unoptimized
        />
      </span>
    </span>
  );
}
