import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { AssistantProvider } from "@/components/assistant/AssistantProvider";
import { AssistantTrigger } from "@/components/assistant/AssistantTrigger";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ATS",
  description: "Applicant Tracking System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        {/* Renders nothing unless this session is an active impersonation —
            placed outside <Nav> so it sits across the full width above the
            sidebar + main content. */}
        <ImpersonationBanner />
        <div className="flex-1 flex min-h-0">
          <AssistantProvider>
            <Nav />
            <div className="flex-1 min-w-0 flex flex-col">{children}</div>
            <AssistantTrigger />
            <AssistantPanel />
          </AssistantProvider>
        </div>
      </body>
    </html>
  );
}
