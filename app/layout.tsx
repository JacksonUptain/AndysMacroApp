import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const appTitle = "Andy's Macro Counter";
const appDescription =
  "A simple local-first macro counter for calories, carbohydrates, fats, and protein.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const previewImage = `${origin}/og.png`;

  return {
    title: appTitle,
    description: appDescription,
    applicationName: appTitle,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
      apple: "/favicon.svg",
    },
    appleWebApp: {
      capable: true,
      title: "Andy's Macros",
      statusBarStyle: "default",
    },
    openGraph: {
      title: appTitle,
      description: appDescription,
      type: "website",
      images: [
        {
          url: previewImage,
          width: 1200,
          height: 630,
          alt: appTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: appTitle,
      description: appDescription,
      images: [previewImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#28795f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
