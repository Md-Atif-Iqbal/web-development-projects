import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_TITLE = "ShopEase — Everything You Love, All in One Place";
const SITE_DESCRIPTION =
  "Discover amazing products across electronics, fashion, home essentials and more from verified sellers across India. Secure payments, easy returns, fast delivery — shopping made effortless.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "ShopEase",
  keywords: ["ShopEase", "online shopping", "marketplace", "India", "e-commerce", "deals", "fashion", "electronics"],
  openGraph: {
    type: "website",
    siteName: "ShopEase",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "ShopEase — Everything You Love, All in One Place",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  appleWebApp: {
    capable: true,
    title: "ShopEase",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  // Favicon / app icons are provided by the src/app file conventions:
  //   src/app/favicon.ico  (16+32+48 PNG-in-ICO)
  //   src/app/icon.svg     (vector favicon)
  //   src/app/apple-icon.png (180x180)
  // Next.js links these automatically — do NOT redeclare `icons` here.
};

export const viewport: Viewport = {
  themeColor: "#FF6B35",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
