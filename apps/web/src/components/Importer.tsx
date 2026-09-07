'use client';

import { useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  parseCsv,
  detectColumns,
  validateRows,
  type ColumnMap,
  type ExistingLocation,
  type ParsedRow,
} from '@/lib/import-parse';
import { commitImportAction } from '@/lib/actions';

const FIELDS: { key: keyof ColumnMap; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'address', label: 'Address', required: true },
  { key: 'latitude', label: 'Latitude', required: true },
  { key: 'longitude', label: 'Longitude', required: true },
  { key: 'quantity', label: 'Quantity' },
  { key: 'productType', label: 'Delivery type' },
  { key: 'notes', label: 'Notes' },
];

function CommitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {pending ? 'Importing…' : `Import ${count} location${count === 1 ? '' : 's'}`}
    </button>
  );
}

export default function Importer({ existing }: { existing: ExistingLocation[] }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [map, setMap] = useState<ColumnMap>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, formAction] = useActionState(commitImportAction, null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    setHeaders([]);
    setDataRows([]);

    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      setFileError(
        'Spreadsheet (.xlsx/.xls) parsing is not implemented yet — it needs a spreadsheet parser dependency. Export the sheet as CSV and upload that instead.',
      );
      return;
    }
    if (!lower.endsWith('.csv')) {
      setFileError('Please choose a .csv file.');
      return;
    }

    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setFileError('That file has no data rows — expected a header row plus at least one record.');
      return;
    }

    setHeaders(rows[0]);
    setDataRows(rows.slice(1));
    setMap(detectColumns(rows[0]));
  }

  const parsed: ParsedRow[] = headers.length ? validateRows(dataRows, map, existing) : [];
  const valid = parsed.filter((r) => r.errors.length === 0 && !r.duplicateOf);
  const invalid = parsed.filter((r) => r.errors.length > 0);
  const duplicates = parsed.filter((r) => r.errors.length === 0 && r.duplicateOf);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Choose a CSV file</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onFile}
            className="mt-1.5 block w-full cursor-pointer rounded-lg text-sm text-slate-700 ring-1 ring-inset ring-slate-300 file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          />
        </label>
        <p className="mt-2 text-xs text-slate-600">
          Recognised headers include name/customer/building, address, latitude/lat, longitude/lng,
          quantity/qty, type, notes. Nothing is written until you confirm the preview below.
        </p>
        {fileError && (
          <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            {fileError}
          </p>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
          {state.success}
        </p>
      )}

      {headers.length > 0 && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Column mapping</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Detected automatically from your headers. Adjust anything that looks wrong.
              </p>
            </header>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <label key={String(f.key)} className="block">
                  <span className="text-sm font-medium text-slate-800">
                    {f.label}
                    {f.required && <span className="ml-0.5 text-red-600">*</span>}
                  </span>
                  <select
                    value={map[f.key] ?? ''}
                    onChange={(e) =>
                      setMap((prev) => ({
                        ...prev,
                        [f.key]: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                  >
                    <option value="">— not mapped —</option>
                    {headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `(column ${i + 1})`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Total rows', value: parsed.length, tone: 'text-slate-900' },
              { label: 'Will import', value: valid.length, tone: 'text-emerald-700' },
              { label: 'Duplicates skipped', value: duplicates.length, tone: 'text-amber-700' },
              { label: 'Invalid rows', value: invalid.length, tone: 'text-red-700' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{s.label}</p>
                <p className={`mt-2 text-3xl font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Import preview</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Every row is listed — invalid and duplicate rows are shown with the exact reason,
                never silently dropped.
              </p>
            </header>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left">
                    {['#', 'Name', 'Address', 'Coordinates', 'Qty', 'Outcome'].map((h) => (
                      <th key={h} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsed.map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-5 py-3 tabular-nums text-slate-600">{i + 1}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{r.name || '—'}</td>
                      <td className="max-w-56 px-5 py-3 text-slate-700">
                        <span className="break-anywhere">{r.address || '—'}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700">
                        {r.latitude != null && r.longitude != null
                          ? `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-slate-700">{r.quantity ?? '—'}</td>
                      <td className="px-5 py-3">
                        {r.errors.length > 0 ? (
                          <span className="text-red-800">{r.errors.join('; ')}</span>
                        ) : r.duplicateOf ? (
                          <span className="text-amber-800">Duplicate of {r.duplicateOf}</span>
                        ) : (
                          <span className="text-emerald-800">Ready to import</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form action={formAction} className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-4">
              <input type="hidden" name="rows" value={JSON.stringify(parsed)} />
              <CommitButton count={valid.length} />
              <p className="text-sm text-slate-600">
                {valid.length === 0
                  ? 'Nothing valid to import yet — fix the mapping or the source file.'
                  : `Creates ${valid.length} location${valid.length === 1 ? '' : 's'}; rows with a quantity also get an active subscription.`}
              </p>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
