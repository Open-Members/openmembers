import type { CSSProperties } from "react";
import type { EntryBackground } from "@/core/theme/appearance";
import { getReadableForeground } from "@/core/theme/contrast";

/** Shared by the published screens and the administrator's draft preview. */
export function EntryBackgroundLayer({
  background,
}: {
  background: EntryBackground;
}) {
  if (!background) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="entry-background"
      className="pointer-events-none absolute inset-0"
      style={
        background.mode === "color"
          ? { backgroundColor: background.color }
          : {
              backgroundImage: `url(${JSON.stringify(background.imageUrl)})`,
              backgroundSize: "cover",
              backgroundPosition: `center ${background.position}`,
            }
      }
    >
      {background.mode === "image" && (
        <div
          data-testid="entry-background-overlay"
          className="absolute inset-0 bg-[var(--color-background)]"
          style={{ opacity: background.overlayOpacity / 100 }}
        />
      )}
    </div>
  );
}

export function entrySurfaceStyle(background: EntryBackground): CSSProperties {
  if (background?.mode !== "color") return {};
  const foreground = getReadableForeground(background.color);
  return {
    "--color-background": background.color,
    "--color-card": background.color,
    "--color-muted": `color-mix(in srgb, ${foreground} 10%, ${background.color})`,
    "--color-foreground": foreground,
    "--color-muted-foreground": foreground,
    "--color-border": `color-mix(in srgb, ${foreground} 28%, transparent)`,
  } as CSSProperties;
}

/** Solid backgrounds choose the logo ink independently of the global theme. */
export function entryBrandSurface(
  background: EntryBackground,
): "light" | "dark" | undefined {
  if (background?.mode !== "color") return undefined;
  return getReadableForeground(background.color) === "#000000"
    ? "light"
    : "dark";
}
