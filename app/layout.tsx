import type { Metadata } from "next";
import { SITE } from "@/config/availability";
import "./globals.css";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.intro,
  robots: { index: false, follow: false }, // 검색엔진 노출 방지
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
