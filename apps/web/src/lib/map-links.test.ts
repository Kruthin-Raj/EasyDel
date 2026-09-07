import { describe, it, expect } from 'vitest';
import { parseMapLink, splitLinks } from './map-links';

const near = (a: number, b: number) => Math.abs(a - b) < 0.0005;

describe('parseMapLink — Google Maps', () => {
  it('prefers the !3d/!4d pin over the @ viewport centre', () => {
    // These deliberately differ: @ is where the map was centred, !3d/!4d is the
    // actual place. Taking the wrong one puts the pin on the wrong street.
    const r = parseMapLink(
      'https://www.google.com/maps/place/Green+Residency/@13.6300,79.4200,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d13.6288!4d79.4192',
    );
    expect(r.error).toBeNull();
    expect(near(r.latitude!, 13.6288)).toBe(true);
    expect(near(r.longitude!, 79.4192)).toBe(true);
    expect(r.name).toBe('Green Residency');
  });

  it('falls back to the @ pair and says so', () => {
    const r = parseMapLink('https://www.google.com/maps/@13.6288,79.4192,15z');
    expect(r.error).toBeNull();
    expect(near(r.latitude!, 13.6288)).toBe(true);
    expect(r.source).toMatch(/map centre/);
  });

  it('reads ?q=, ?query=, ?destination= and ?daddr=', () => {
    for (const url of [
      'https://maps.google.com/?q=13.6288,79.4192',
      'https://www.google.com/maps/search/?api=1&query=13.6288,79.4192',
      'https://www.google.com/maps/dir/?api=1&destination=13.6288,79.4192',
      'https://maps.google.com/maps?daddr=13.6288,79.4192',
    ]) {
      const r = parseMapLink(url);
      expect(r.error, url).toBeNull();
      expect(near(r.latitude!, 13.6288), url).toBe(true);
      expect(near(r.longitude!, 79.4192), url).toBe(true);
    }
  });

  it('converts a degrees/minutes/seconds place path', () => {
    const r = parseMapLink(
      "https://www.google.com/maps/place/13%C2%B037'43.7%22N+79%C2%B025'09.1%22E/",
    );
    expect(r.error).toBeNull();
    expect(near(r.latitude!, 13.6288)).toBe(true);
    expect(near(r.longitude!, 79.4192)).toBe(true);
  });

  it('decodes a percent-encoded place name', () => {
    const r = parseMapLink(
      'https://www.google.com/maps/place/Sai+Towers+%26+Co/@13.6335,79.4241,17z/data=!3d13.6335!4d79.4241',
    );
    expect(r.name).toBe('Sai Towers & Co');
  });

  it('does not treat a coordinate string as a name', () => {
    const r = parseMapLink('https://maps.google.com/?q=13.6288,79.4192');
    expect(r.name).toBeNull();
  });

  it('reports a place-only link instead of guessing a position', () => {
    const r = parseMapLink('https://www.google.com/maps/place/Some+Shop');
    expect(r.latitude).toBeNull();
    expect(r.error).toMatch(/no coordinates/i);
    expect(r.name).toBe('Some Shop');
  });

  it('flags short links as needing expansion rather than failing outright', () => {
    const r = parseMapLink('https://maps.app.goo.gl/AbCdEf123');
    expect(r.needsResolution).toBe(true);
    expect(r.latitude).toBeNull();
  });
});

describe('parseMapLink — Apple and Waze', () => {
  it('reads Apple ?ll= and keeps the name', () => {
    const r = parseMapLink('https://maps.apple.com/?ll=13.6288,79.4192&name=Green%20Residency');
    expect(r.error).toBeNull();
    expect(near(r.latitude!, 13.6288)).toBe(true);
    expect(r.name).toBe('Green Residency');
    expect(r.source).toBe('Apple Maps');
  });

  it('reads Apple ?q= coordinates', () => {
    const r = parseMapLink('https://maps.apple.com/?q=13.6288,79.4192');
    expect(near(r.latitude!, 13.6288)).toBe(true);
  });

  it('reports an Apple address-only link', () => {
    const r = parseMapLink('https://maps.apple.com/?address=12%20Tilak%20Rd');
    expect(r.latitude).toBeNull();
    expect(r.error).toMatch(/no coordinates/i);
  });

  it('reads Waze ll and latlng', () => {
    for (const url of [
      'https://waze.com/ul?ll=13.6288,79.4192',
      'https://www.waze.com/live-map?latlng=13.6288,79.4192',
    ]) {
      const r = parseMapLink(url);
      expect(r.error, url).toBeNull();
      expect(near(r.latitude!, 13.6288), url).toBe(true);
    }
  });
});

describe('parseMapLink — bare input', () => {
  it('accepts a comma-separated pair', () => {
    const r = parseMapLink('13.6288, 79.4192');
    expect(r.error).toBeNull();
    expect(near(r.latitude!, 13.6288)).toBe(true);
    expect(r.source).toBe('coordinates');
  });

  it('accepts a space-separated pair and negatives', () => {
    expect(near(parseMapLink('13.6288 79.4192').latitude!, 13.6288)).toBe(true);
    const south = parseMapLink('-33.8688, 151.2093');
    expect(near(south.latitude!, -33.8688)).toBe(true);
  });

  it('accepts pasted DMS', () => {
    const r = parseMapLink(`13°37'43.7"N 79°25'09.1"E`);
    expect(near(r.latitude!, 13.6288)).toBe(true);
  });

  it('rejects out-of-range coordinates', () => {
    expect(parseMapLink('200, 79.4192').error).toMatch(/out of range/i);
    expect(parseMapLink('13.6288, 300').error).toMatch(/out of range/i);
  });

  it('rejects 0,0 — almost always a parsing artefact, not a delivery', () => {
    expect(parseMapLink('0, 0').error).toMatch(/out of range/i);
  });

  it('rejects plain text and empty input with a usable message', () => {
    expect(parseMapLink('my house on the corner').error).toMatch(/Not a map link/);
    expect(parseMapLink('   ').error).toMatch(/Empty/);
    expect(parseMapLink('http://').error).toBeTruthy();
  });

  it('names the site when it is not a map provider', () => {
    const r = parseMapLink('https://example.com/somewhere');
    expect(r.error).toMatch(/Unrecognised map site \(example\.com\)/);
  });
});

describe('splitLinks', () => {
  it('splits on newlines and drops blanks', () => {
    expect(splitLinks('a\n\n b \n\nc')).toEqual(['a', 'b', 'c']);
  });

  it('splits several links pasted on one line', () => {
    const out = splitLinks(
      'https://maps.google.com/?q=1,1 https://maps.google.com/?q=2,2 https://maps.google.com/?q=3,3',
    );
    expect(out).toHaveLength(3);
    expect(out[2]).toBe('https://maps.google.com/?q=3,3');
  });

  it('keeps a single line with spaces intact', () => {
    expect(splitLinks('13.6288, 79.4192')).toEqual(['13.6288, 79.4192']);
  });

  it('handles CRLF from a Windows paste', () => {
    expect(splitLinks('a\r\nb\r\n')).toEqual(['a', 'b']);
  });
});
