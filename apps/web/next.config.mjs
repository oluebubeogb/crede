/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: { remotePatterns: [] },
  async rewrites() {
    // Same-origin proxy → avoids browser CORS to api-crede
    // Browser calls /backend/* on crede.collab.name.ng; Next forwards to the API.
    const api = process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || "https://api-crede.collab.name.ng";
    return [
      {
        source: "/backend/:path*",
        destination: `${api.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
