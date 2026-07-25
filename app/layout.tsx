import type { Metadata } from "next";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Law18Referee Management — Tournament referee operations";
  const description = "Referee check-in, coaching, assessments, and tournament operations. Provided by FalkSports.";
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Law18Referee Management" },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
