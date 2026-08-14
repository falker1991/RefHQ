import type { Metadata } from "next";
import "./globals.css";
import "./admin-features.css";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Tournament referee operations";
  const fullTitle = "Law18Referee Management - Tournament referee operations";
  const description = "Referee check-in, coaching, ratings, and tournament operations. Provided by FalkSports.";
  return {
    title,
    description,
    openGraph: { title: fullTitle, description },
    twitter: { card: "summary", title: fullTitle, description },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.png", sizes: "32x32", type: "image/png" },
        { url: "/law18ref-icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/law18ref-icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Law18Referee Management" },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
