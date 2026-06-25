import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { Toaster } from "sonner";
import { NotificationProvider } from "@/components/providers/notification-provider";
import { UnreadCountProvider } from "@/components/providers/notification-count-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TAIBA Digital PMS",
  description: "Project Management System for TAIBA Digital",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable}  ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <UnreadCountProvider>
            <NotificationProvider />
            {children}
          </UnreadCountProvider>
        </AuthProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}
