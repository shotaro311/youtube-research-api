import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "YouTube Research Console",
  description: "YouTube URL の解決と動画 raw 抽出を Web アプリで行う Next.js ベースのリサーチコンソール。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="ja">
      <body className={bodyFont.variable}>{children}</body>
    </html>
  );
}
