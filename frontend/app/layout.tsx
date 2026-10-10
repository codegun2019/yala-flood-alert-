import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YALA FLOOD ALERT — เฝ้าระวังน้ำท่วมยะลา",
  description: "ติดตามระดับน้ำ ปริมาณฝน และรับแจ้งเตือนน้ำท่วมจังหวัดยะลา",
  appleWebApp: { capable: true, title: "Yala Flood", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0b5cad", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
