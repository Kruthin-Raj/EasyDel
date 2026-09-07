import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['react-map-gl', 'maplibre-gl', 'lucide-react'],
};

export default nextConfig;
