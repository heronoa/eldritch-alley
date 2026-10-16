// FNV-1a over a canonical serialization. Integer math only, so the hash of a state is the same on
// every runtime.

/** FNV-1a, 32 bits, over the UTF-16 code units of the input. Returns an unsigned 32-bit integer. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Serializes plain data with object keys in sorted order, so two states that differ only in key order
 * produce the same text. Arrays keep their order, because array order is state.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${fields.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}
