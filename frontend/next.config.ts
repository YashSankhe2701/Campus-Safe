import type { NextConfig } from "next";

// Validate required environment variable for production builds
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_API_URL. " +
    "Set NEXT_PUBLIC_API_URL to your deployed FastAPI backend URL before building for production."
  );
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
