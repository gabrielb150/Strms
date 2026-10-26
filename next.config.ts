import type { NextConfig } from "next";

// On GitHub Pages the site lives under /<repo-name>/; set by the deploy workflow.
// Locally and on Vercel/Netlify it is served from the root, so this stays empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
