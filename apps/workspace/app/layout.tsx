import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpendMCPProvider } from "../components/SpendMCPProvider";
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
  title: "SpendMCP — Paid Research Workspace",
  description: "Agents buy premium data with x402 micropayments under human-controlled budgets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SpendMCPProvider>{children}</SpendMCPProvider>
      </body>
    </html>
  );
}
