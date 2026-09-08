import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['react-map-gl', 'maplibre-gl', 'lucide-react'],

  experimental: {
    serverActions: {
      /*
       * Checkpoint photos travel through a Server Action, and the default limit
       * is 1MB. A photo straight off a phone is 2-8MB, so uploading one failed
       * with `Error: Body exceeded 1 MB limit.` — a 500 and a lost checkpoint,
       * with nothing on screen explaining why.
       *
       * 4mb, not more, deliberately: Vercel caps a serverless function's
       * request body at 4.5MB, so a larger value here would still fail once
       * deployed while appearing to work locally. Photos are downscaled in the
       * browser before they are sent (see RecordingConsole), which puts a
       * typical upload at 200-500KB — this ceiling is headroom, not the
       * expected size.
       */
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
