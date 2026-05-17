import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "dynimage", template: "%s | dynimage" },
  description:
    "Dynamic GitHub stat images for README embeds — animated SVG, raster PNG/WebP/AVIF.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
