'use client';

import { Skeleton } from '@heroui/react';

/**
 * Open Members skeleton loading patterns — using HeroUI Skeleton with
 * synchronized shimmer. Each pattern mirrors the final UI layout
 * so loading feels intentional, not broken.
 */

/** Dashboard: greeting + stats grid + daily challenge + recordings */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 max-w-3xl mx-auto w-full">
      {/* Greeting */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-3 w-20 rounded-full" />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* Daily challenge */}
      <Skeleton className="h-20 rounded-2xl" />

      {/* Recent recordings header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>

      {/* Recording rows */}
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-[var(--color-primary)]/10 p-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Feed: tab bar + 3 post cards */
export function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-4 md:p-8 max-w-2xl mx-auto w-full">
      {/* Tab bar */}
      <div className="flex gap-2">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>

      {/* Post cards */}
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border border-[var(--color-primary)]/10 p-5 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
          {/* Text */}
          <Skeleton className="h-5 w-4/5 rounded-lg" />
          {/* Audio player */}
          <Skeleton className="h-12 w-full rounded-xl" />
          {/* Reactions */}
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(j => (
              <Skeleton key={j} className="h-8 w-14 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Progress: stats row + chart + achievements + streak calendar */
export function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 max-w-3xl mx-auto w-full">
      {/* Title */}
      <Skeleton className="h-8 w-48 rounded-full" />

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* Score chart */}
      <div className="rounded-xl border border-[var(--color-primary)]/10 p-6">
        <Skeleton className="h-5 w-36 rounded-full mb-4" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>

      {/* Achievements */}
      <div>
        <Skeleton className="h-5 w-28 rounded-full mb-3" />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* Streak calendar */}
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

/** Leaderboard: title + podium + rows */
export function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-8 max-w-2xl mx-auto w-full">
      <Skeleton className="h-8 w-56 rounded-full" />

      {/* Podium top 3 */}
      <div className="flex items-end justify-center gap-4 py-6">
        <Skeleton className="h-28 w-20 rounded-2xl" />
        <Skeleton className="h-36 w-20 rounded-2xl" />
        <Skeleton className="h-24 w-20 rounded-2xl" />
      </div>

      {/* Rows */}
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-[var(--color-primary)]/10 px-4 py-3">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="h-3 w-20 rounded-full" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Practice Hub: 3 trail cards + daily challenge */
export function PracticeHubSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-4 md:p-8 max-w-3xl mx-auto w-full">
      {/* Page title */}
      <Skeleton className="h-8 w-40 rounded-full" />

      {/* Daily challenge */}
      <Skeleton className="h-24 rounded-2xl" />

      {/* Trail cards */}
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border border-[var(--color-primary)]/10 overflow-hidden">
          <Skeleton className="h-32 w-full rounded-none" />
          <div className="p-5 space-y-3">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      ))}

      {/* Bottom cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    </div>
  );
}

/** Profile page: avatar + stats + recordings */
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 max-w-2xl mx-auto w-full">
      {/* Avatar + name */}
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-24 w-24 rounded-full" />
        <Skeleton className="h-6 w-36 rounded-full" />
        <Skeleton className="h-4 w-24 rounded-full" />
      </div>

      {/* Stats row */}
      <div className="flex justify-center gap-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
        ))}
      </div>

      {/* Action button */}
      <Skeleton className="h-10 w-32 rounded-full mx-auto" />

      {/* Recordings */}
      {[1, 2, 3].map(i => (
        <Skeleton key={i} className="h-20 rounded-2xl" />
      ))}
    </div>
  );
}

/** Generic card skeleton — for any page that shows a card grid */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-2xl" />
      ))}
    </div>
  );
}
