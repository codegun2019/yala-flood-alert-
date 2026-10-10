// On Vercel the browser-facing site proxies /api/* to the separately deployed backend project.
// Override with the API_URL env var in the Vercel project settings.
const API_URL = process.env.API_URL || (process.env.VERCEL ? "https://yala-flood-alert-exzh.vercel.app" : "http://127.0.0.1:8000");

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
