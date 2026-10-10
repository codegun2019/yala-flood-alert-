import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "YALA FLOOD ALERT — เฝ้าระวังน้ำท่วมยะลา",
    short_name: "Yala Flood",
    description: "ติดตามระดับน้ำ ปริมาณฝน กล้อง CCTV และรับแจ้งเตือนน้ำท่วมจังหวัดยะลา 24 ชั่วโมง",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0b5cad",
    theme_color: "#0b5cad",
    lang: "th",
    dir: "ltr",
    categories: ["weather", "utilities", "news"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "สถานการณ์น้ำ", short_name: "สถานการณ์", url: "/?tab=status&source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "แผนที่สถานี", short_name: "แผนที่", url: "/?tab=map&source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ปริมาณฝน", short_name: "ฝน", url: "/?tab=rain&source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ตั้งค่าแจ้งเตือน", short_name: "แจ้งเตือน", url: "/?tab=notify&source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
