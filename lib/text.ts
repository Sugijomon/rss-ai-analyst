const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeHtmlEntity(entity: string): string {
  const normalized = entity.toLowerCase();
  if (normalized.startsWith('#x')) {
    const codePoint = Number.parseInt(normalized.slice(2), 16);
    return isValidUnicodeCodePoint(codePoint)
      ? String.fromCodePoint(codePoint)
      : '&' + entity + ';';
  }

  if (normalized.startsWith('#')) {
    const codePoint = Number.parseInt(normalized.slice(1), 10);
    return isValidUnicodeCodePoint(codePoint)
      ? String.fromCodePoint(codePoint)
      : '&' + entity + ';';
  }

  return NAMED_HTML_ENTITIES[normalized] ?? '&' + entity + ';';
}

function isValidUnicodeCodePoint(value: number): boolean {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 0x10ffff &&
    (value < 0xd800 || value > 0xdfff);
}

export function normalizeFeedText(value: string): string {
  let normalized = value;

  // Google Alerts can return both encoded and double-encoded entities.
  for (let pass = 0; pass < 2; pass += 1) {
    normalized = normalized.replace(
      /&(#\d+|#x[\da-f]+|amp|apos|gt|lt|nbsp|quot);/gi,
      (_match, entity: string) => decodeHtmlEntity(entity)
    );
  }

  return normalized
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
