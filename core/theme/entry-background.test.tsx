import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, it, expect } from "vitest";
import {
  EntryBackgroundLayer,
  entrySurfaceStyle,
} from "@/shared/components/ui/EntryBackground";
afterEach(cleanup);
it("leaves the legacy backdrop untouched when configuration is absent", () => {
  const { container } = render(<EntryBackgroundLayer background={null} />);
  expect(container).toBeEmptyDOMElement();
  expect(entrySurfaceStyle(null)).toEqual({});
});
it("renders the specified image position and theme-aware overlay", () => {
  render(
    <EntryBackgroundLayer
      background={{
        mode: "image",
        imageUrl: "/login.png",
        position: "top",
        overlayOpacity: 75,
      }}
    />,
  );
  expect(screen.getByTestId("entry-background")).toHaveStyle({
    backgroundPosition: "center top",
    backgroundImage: 'url("/login.png")',
  });
  expect(screen.getByTestId("entry-background-overlay")).toHaveStyle({
    opacity: 0.75,
  });
});
it("keeps readable foreground tokens on a solid background", () => {
  expect(entrySurfaceStyle({ mode: "color", color: "#ffffff" })).toHaveProperty(
    "--color-foreground",
    "#000000",
  );
  expect(entrySurfaceStyle({ mode: "color", color: "#000000" })).toHaveProperty(
    "--color-foreground",
    "#ffffff",
  );
});

it("selects the brand variant from a solid surface while preserving theme selection for other backgrounds", async () => {
  const { entryBrandSurface } = await import(
    "@/shared/components/ui/EntryBackground"
  );
  expect(entryBrandSurface({ mode: "color", color: "#edf2f7" })).toBe("light");
  expect(entryBrandSurface({ mode: "color", color: "#123456" })).toBe("dark");
  expect(entryBrandSurface(null)).toBeUndefined();
  expect(
    entryBrandSurface({
      mode: "image",
      imageUrl: "/image.png",
      position: "center",
      overlayOpacity: 70,
    }),
  ).toBeUndefined();
});
