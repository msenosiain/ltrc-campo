export function toTitleCase(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

export function toLowerCase(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}
