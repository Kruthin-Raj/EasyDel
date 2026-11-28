import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EasyDel — Delivery Route Companion',
    short_name: 'EasyDel',
    description: 'Create, share by code, memorize stops, and deliver routes offline.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0f17',
    theme_color: '#f59e0b',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
  };
}
