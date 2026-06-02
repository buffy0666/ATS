import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      // Server Actions default to a 1 MB request-body cap — anything larger
      // is rejected by the framework before the action runs, surfacing as
      // "An unexpected response was received from the server." We accept file
      // uploads well above that: knowledge attachments and job contracts allow
      // 20 MB per file and multiple files per submit. Raise the cap to give
      // those headroom (plus multipart overhead).
      bodySizeLimit: "60mb",
    },
  },
};

export default nextConfig;
