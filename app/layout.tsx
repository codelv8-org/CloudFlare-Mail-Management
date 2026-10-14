import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relaydesk — Cloudflare Email Routing",
  description: "จัดการ Email Routing พร้อม Platform tags กลุ่มผู้ใช้ และ Priority ในพื้นที่ส่วนตัว",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
