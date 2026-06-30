export function normalizeText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CANONICAL_TERMS = [
  'create',
  'add',
  'make',
  'place',
  'submit',
  'book',
  'new',
  'update',
  'change',
  'set',
  'mark',
  'modify',
  'edit',
  'delete',
  'remove',
  'erase',
  'approve',
  'authorize',
  'accept',
  'list',
  'show',
  'display',
  'fetch',
  'load',
  'search',
  'find',
  'lookup',
  'look',
  'get',
  'check',
  'see',
  'verify',
  'read',
  'status',
  'state',
  'order',
  'record',
  'item',
  'pending',
  'processing',
  'fulfilled',
  'cancelled',
  'canceled',
  'approved',
  'complete',
  'completed',
  'duplicate',
  'repeated',
  'same',
];

const WORD_ALIASES: Record<string, string> = {
  creat: 'create',
  crete: 'create',
  crate: 'create',
  oder: 'order',
  orde: 'order',
  ordar: 'order',
  ordor: 'order',
  stats: 'status',
  statu: 'status',
  statuz: 'status',
  stat: 'status',
  serch: 'search',
  searh: 'search',
  serach: 'search',
  delte: 'delete',
  delet: 'delete',
  remve: 'remove',
  updte: 'update',
  updat: 'update',
  fulfiled: 'fulfilled',
  fulfil: 'fulfilled',
  canceled: 'cancelled',
  duplcate: 'duplicate',
  duplicat: 'duplicate',
  repeted: 'repeated',
};

function editDistanceWithin(a: string, b: string, maxDistance: number): boolean {
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  if (a === b) return true;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prevDiagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];

    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, prevDiagonal + cost);
      prevDiagonal = temp;
      rowMin = Math.min(rowMin, previous[j]);
    }

    if (rowMin > maxDistance) return false;
  }

  return previous[b.length] <= maxDistance;
}

function canonicalWord(word: string): string {
  const normalized = normalizeText(word);
  if (!normalized) return '';
  const singular = normalized.endsWith('s') && normalized.length > 3 ? normalized.slice(0, -1) : normalized;
  if (WORD_ALIASES[singular]) return WORD_ALIASES[singular];
  if (CANONICAL_TERMS.includes(singular)) return singular;

  const maxDistance = singular.length <= 4 ? 1 : 2;
  const matched = CANONICAL_TERMS.find((term) => editDistanceWithin(singular, term, maxDistance));
  return matched ?? singular;
}

export function words(value: string): string[] {
  const ignored = new Set([
    'a',
    'an',
    'and',
    'are',
    'can',
    'could',
    'for',
    'how',
    'i',
    'if',
    'is',
    'it',
    'me',
    'my',
    'of',
    'please',
    'the',
    'to',
    'you',
    'that',
    'has',
    'have',
    'with',
  ]);

  return normalizeText(value)
    .split(/\s+/)
    .map(canonicalWord)
    .filter((word) => word.length > 2 && !ignored.has(word));
}

export function humanizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
