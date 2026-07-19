import type { NextConfig } from "next";

function normalizeBasePath(value: string | undefined) {
  if (!value || value === "/") {
    return "";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

const isStaticExport =
  process.env.STATIC_EXPORT === "true" || process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const inferredPagesBasePath =
  process.env.GITHUB_PAGES === "true" &&
  repositoryName &&
  !repositoryName.endsWith(".github.io")
    ? `/${repositoryName}`
    : "";
const basePath = normalizeBasePath(
  process.env.NEXT_PUBLIC_BASE_PATH ?? inferredPagesBasePath,
);

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
        basePath: basePath || undefined,
        assetPrefix: basePath || undefined,
      }
    : {}),
};

export default nextConfig;
