/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["@supabase/supabase-js"],
  },
};

export default nextConfig;
