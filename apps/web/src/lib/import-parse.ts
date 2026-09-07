import { isValidCoord, haversine } from './optimize';

/**
 * CSV parsing + column auto-detection for the location importer.
 *
 * Pure functions so the validation rules are unit-testable without a database
 * or a file upload.
 *
 * .xlsx / .xls are NOT handled here — that needs a spreadsheet parser
 * dependency (SheetJS). The UI states this explicitly rather than accepting
 * the file and silently failing.
 */

/** RFC4180-ish splitter: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Canonical field -> accepted header spellings, lowercased. */
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['name', 'customer', 'customer name', 'customername', 'building', 'building name', 'buildingname', 'client'],
  address: ['address', 'street', 'location', 'full address', 'addr'],
  latitude: ['latitude', 'lat', 'y'],
  longitude: ['longitude', 'lng', 'lon', 'long', 'x'],
  quantity: ['quantity', 'qty', 'count', 'copies', 'amount'],
  productType: ['type', 'product', 'product type', 'producttype', 'delivery type', 'deliverytype', 'item'],
  notes: ['notes', 'note', 'instructions', 'delivery instructions', 'deliveryinstructions', 'remarks', 'comment'],
};

/** One validated row from an uploaded file, ready for the import preview. */
export type ParsedRow = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  quantity: number | null;
  productType: string | null;
  notes: string | null;
  /** Human-readable validation failures. Empty means the row is importable. */
  errors: string[];
  /** Set when this row matches an existing location or an earlier row. */
  duplicateOf: string | null;
};

export type ColumnMap = Partial<Record<keyof typeof COLUMN_ALIASES, number>>;

export function detectColumns(headers: string[]): ColumnMap {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const map: ColumnMap = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = norm.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field as keyof ColumnMap] = idx;
  }
  return map;
}

function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ExistingLocation = { name: string; latitude: number; longitude: number };

/**
 * Validates each data row and flags duplicates, both against locations already
 * in the database and against earlier rows in the same file.
 */
export function validateRows(
  dataRows: string[][],
  map: ColumnMap,
  existing: ExistingLocation[],
): ParsedRow[] {
  const out: ParsedRow[] = [];

  for (const cells of dataRows) {
    const get = (f: keyof ColumnMap) => (map[f] != null ? cells[map[f] as number] : undefined);

    const name = (get('name') ?? '').trim();
    const address = (get('address') ?? '').trim();
    const latitude = num(get('latitude'));
    const longitude = num(get('longitude'));
    const quantity = num(get('quantity'));
    const productType = (get('productType') ?? '').trim() || null;
    const notes = (get('notes') ?? '').trim() || null;

    const errors: string[] = [];
    if (!name) errors.push('Missing name');
    if (!address) errors.push('Missing address');

    if (latitude == null || longitude == null) {
      // Geocoding would fill these in; not yet implemented, so the row is
      // surfaced as invalid rather than imported at 0,0.
      errors.push('Missing coordinates (geocoding not yet implemented)');
    } else if (!isValidCoord(latitude, longitude)) {
      errors.push('Coordinates out of range');
    }

    if (quantity != null && (quantity < 0 || !Number.isInteger(quantity))) {
      errors.push('Quantity must be a whole number ≥ 0');
    }

    let duplicateOf: string | null = null;
    if (latitude != null && longitude != null && isValidCoord(latitude, longitude)) {
      const hit = existing.find(
        (e) => haversine({ lat: latitude, lng: longitude }, { lat: e.latitude, lng: e.longitude }) < 60,
      );
      if (hit) duplicateOf = `${hit.name} (already in database)`;

      if (!duplicateOf) {
        const earlier = out.find(
          (r) =>
            r.latitude != null &&
            r.longitude != null &&
            haversine({ lat: latitude, lng: longitude }, { lat: r.latitude, lng: r.longitude }) < 60,
        );
        if (earlier) duplicateOf = `${earlier.name} (earlier row in this file)`;
      }
    }

    out.push({ name, address, latitude, longitude, quantity, productType, notes, errors, duplicateOf });
  }

  return out;
}

export const IMPORT_FIELDS = Object.keys(COLUMN_ALIASES);
