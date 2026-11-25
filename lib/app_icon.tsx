import { ImageResponse } from "next/og";

export const BRAND_GREEN = "#059669";

/**
 * The «SL» badge of the header as a PNG, for the favicon and the installed app (PWA).
 * `maskable`: full-bleed square with the letters inside the safe zone, so the operating system
 * can crop it to its own shape (circle, rounded square...).
 */
export function appIcon(size: number, maskable = false): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_GREEN,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
          color: "#ffffff",
          fontSize: Math.round(size * (maskable ? 0.34 : 0.46)),
          fontWeight: 700,
          letterSpacing: -Math.round(size * 0.01),
        }}
      >
        SL
      </div>
    ),
    { width: size, height: size }
  );
}
