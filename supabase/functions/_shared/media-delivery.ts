export const PUBLIC_MEDIA_SIGNED_URL_SECONDS = 600;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVariantUuid(value: string | null): value is string {
  return value !== null && UUID_PATTERN.test(value);
}

export function matchesSecret(expected: string, actual: string | null) {
  if (!actual || expected.length !== actual.length) return false;
  let different = 0;
  for (let index = 0; index < expected.length; index++) {
    different |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return different === 0;
}
