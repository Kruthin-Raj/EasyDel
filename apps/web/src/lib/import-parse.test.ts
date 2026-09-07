import { describe, it, expect } from 'vitest';
import { parseCsv, detectColumns, validateRows, type ExistingLocation } from './import-parse';

describe('parseCsv', () => {
  it('parses a simple file', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,address\nGreen,"12 Tilak Rd, Tirupati"')).toEqual([
      ['name', 'address'],
      ['Green', '12 Tilak Rd, Tirupati'],
    ]);
  });

  it('handles escaped double quotes', () => {
    expect(parseCsv('note\n"He said ""hello"""')).toEqual([['note'], ['He said "hello"']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('skips fully blank lines', () => {
    expect(parseCsv('a\n\n\nb')).toEqual([['a'], ['b']]);
  });
});

describe('detectColumns', () => {
  it('detects canonical headers', () => {
    const map = detectColumns(['name', 'address', 'latitude', 'longitude', 'quantity', 'type', 'notes']);
    expect(map).toEqual({
      name: 0, address: 1, latitude: 2, longitude: 3, quantity: 4, productType: 5, notes: 6,
    });
  });

  it('detects common aliases case-insensitively', () => {
    const map = detectColumns(['Customer Name', 'Addr', 'Lat', 'LNG', 'Qty', 'Delivery Type', 'Remarks']);
    expect(map.name).toBe(0);
    expect(map.address).toBe(1);
    expect(map.latitude).toBe(2);
    expect(map.longitude).toBe(3);
    expect(map.quantity).toBe(4);
    expect(map.productType).toBe(5);
    expect(map.notes).toBe(6);
  });

  it('leaves unmatched fields undefined', () => {
    expect(detectColumns(['foo', 'bar']).name).toBeUndefined();
  });
});

describe('validateRows', () => {
  const map = detectColumns(['name', 'address', 'latitude', 'longitude', 'quantity']);
  const none: ExistingLocation[] = [];

  it('accepts a complete row', () => {
    const [row] = validateRows([['Green Residency', '12 Tilak Rd', '13.6288', '79.4192', '12']], map, none);
    expect(row.errors).toEqual([]);
    expect(row.duplicateOf).toBeNull();
    expect(row.latitude).toBe(13.6288);
    expect(row.quantity).toBe(12);
  });

  it('flags a missing name and address', () => {
    const [row] = validateRows([['', '', '13.6', '79.4', '1']], map, none);
    expect(row.errors).toContain('Missing name');
    expect(row.errors).toContain('Missing address');
  });

  it('flags missing coordinates rather than importing at 0,0', () => {
    const [row] = validateRows([['Green', '12 Tilak Rd', '', '', '1']], map, none);
    expect(row.errors.some((e) => e.startsWith('Missing coordinates'))).toBe(true);
    expect(row.latitude).toBeNull();
  });

  it('flags out-of-range coordinates', () => {
    const [row] = validateRows([['Green', '12 Tilak Rd', '200', '79.4', '1']], map, none);
    expect(row.errors).toContain('Coordinates out of range');
  });

  it('flags a fractional or negative quantity', () => {
    const [a] = validateRows([['G', 'addr', '13.6', '79.4', '1.5']], map, none);
    expect(a.errors).toContain('Quantity must be a whole number ≥ 0');
    const [b] = validateRows([['G', 'addr', '13.6', '79.4', '-2']], map, none);
    expect(b.errors).toContain('Quantity must be a whole number ≥ 0');
  });

  it('detects a duplicate of an existing database location', () => {
    const existing: ExistingLocation[] = [
      { name: 'Green Residency', latitude: 13.6288, longitude: 79.4192 },
    ];
    const [row] = validateRows([['Green Copy', '12 Tilak Rd', '13.6288', '79.4192', '1']], map, existing);
    expect(row.duplicateOf).toContain('already in database');
  });

  it('detects a duplicate of an earlier row in the same file', () => {
    const rows = validateRows(
      [
        ['First', 'addr', '13.6288', '79.4192', '1'],
        ['Second', 'addr', '13.6288', '79.4192', '1'],
      ],
      map,
      none,
    );
    expect(rows[0].duplicateOf).toBeNull();
    expect(rows[1].duplicateOf).toContain('earlier row');
  });

  it('does not flag locations that are far apart', () => {
    const rows = validateRows(
      [
        ['First', 'addr', '13.6288', '79.4192', '1'],
        ['Second', 'addr', '13.6500', '79.4500', '1'],
      ],
      map,
      none,
    );
    expect(rows.every((r) => r.duplicateOf === null)).toBe(true);
  });

  it('returns one result per input row, never silently dropping any', () => {
    const rows = validateRows(
      [
        ['ok', 'addr', '13.6', '79.4', '1'],
        ['', '', '', '', ''],
        ['also ok', 'addr', '13.7', '79.5', '2'],
      ],
      map,
      none,
    );
    expect(rows).toHaveLength(3);
  });
});
