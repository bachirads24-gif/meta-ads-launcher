import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "1gb" },
    middlewareClientMaxBodySize: "1gb",
  },
};

export default config;
