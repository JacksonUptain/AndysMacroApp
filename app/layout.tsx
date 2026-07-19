import type { Metadata, Viewport } from "next";
import "./globals.css";

const appTitle = "Andy's Macro Counter";
const appDescription =
  "A personal macro counter for calories, carbohydrates, fats, and protein.";

function normalizeBasePath(value: string | undefined) {
  if (!value || value === "/") {
    return "";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://andrews-macro-counter.firebaseapp.com";

function publicPath(path: string) {
  return `${basePath}${path}`;
}

const previewImage = publicPath("/og.png");

export const metadata: Metadata = {
  title: appTitle,
  description: appDescription,
  applicationName: appTitle,
  metadataBase: new URL(siteUrl),
  manifest: publicPath("/manifest.webmanifest"),
  icons: {
    icon: publicPath("/favicon.svg"),
    shortcut: publicPath("/favicon.svg"),
    apple: publicPath("/favicon.svg"),
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
