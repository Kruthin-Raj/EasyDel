'use client';

import { useRouter } from 'next/navigation';

export default function RouteTemplateSelector({
  routes,
  currentRouteId,
}: {
  routes: { id: string; name: string }[];
  currentRouteId?: string;
}) {
  const router = useRouter();

  return (
    <label className="block mb-6">
      <span className="mb-1.5 block text-sm font-medium text-ink">Duplicate existing route</span>
      <select
        className="field"
        value={currentRouteId ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          if (val) {
            router.push(`/routes/new?baseRoute=${val}`);
          } else {
            router.push(`/routes/new`);
          }
        }}
      >
        <option value="">Start from scratch</option>
        {routes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-ink-dim">
        Copies the stops from an existing route so you can quickly tweak them.
      </p>
    </label>
  );
}
