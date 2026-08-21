import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const githubBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/JetHFVO";

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  assetPrefix: isGitHubPages ? githubBasePath : undefined,
  trailingSlash: isGitHubPages,
};

export default nextConfig;
