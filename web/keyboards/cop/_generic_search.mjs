/**
 * Coptic-only, source-aware Unicode prefix predictor.
 *
 * "attested" is retained for Renpet API compatibility: it means a surface
 * exists in the compiled source inventory, NOT that a particular manuscript
 * witness, lemma identity, or dialect attribution was individually verified.
 * A keyboard suggestion never silently edits input or changes its Unicode.
 */
export const LANGUAGE = 'cop';
const collate = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const COPTIC = /[\p{Script=Coptic}\p{Script=Greek}]/u;
const PLAIN_WORD = /^[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+$/u;
const PHRASE = /^[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+(?:\s+[\p{Script=Coptic}\p{Script=Greek}\p{Mark}]+)+$/u;
const DIALECTS = new Set(['all', 'sahidic', 'bohairic']);

export function keyboardKey(value, language = LANGUAGE) {
  if (language !== LANGUAGE) throw new RangeError('This package only supports Coptic');
  if (typeof value !== 'string') throw new TypeError('Coptic input must be Unicode text');
  // Normalize only the lookup key; preserve source spellings for insertion.
  return value.normalize('NFD').toLocaleLowerCase('und')
    .replace(/\p{Mark}/gu, '').normalize('NFC');
}

/** Conservative insertion policy; source transcription/editorial forms remain
 * searchable in a separate opt-in mode without being stripped or fabricated. */
export function isInsertableSurface(text, {includeEditorial = false, includePhrases = false} = {}) {
  if (typeof text !== 'string' || !COPTIC.test(text)) return false;
  if (PLAIN_WORD.test(text)) return true;
  if (includePhrases && PHRASE.test(text)) return true;
  return Boolean(includeEditorial);
}

function frequency(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0;
}

function usage(map, key) {
  if (!map || typeof map !== 'object') return 0;
  const n = Number(Object.hasOwn(map, key) ? map[key] : 0);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10000) : 0;
}

function checkDialect(dialect) {
  if (!DIALECTS.has(dialect)) throw new RangeError('Dialect must be all, sahidic, or bohairic');
}

function allowed(mask, dialect) {
  if (dialect === 'all') return true;
  return dialect === 'sahidic' ? Boolean(mask & 1) : Boolean(mask & 2);
}

/** Build the sorted index exactly once per release, never per keystroke.
 * Accepts the established compact coptic-predict-v1 browser payload. */
export function prepareKeyboardIndex(language, pack) {
  if (language !== LANGUAGE) throw new RangeError('Wrong keyboard language');
  if (!pack || !Array.isArray(pack.rows)) throw new TypeError('Coptic lexicon rows required');
  const seen = new Set();
  const rows = pack.rows.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 ||
        typeof entry[0] !== 'string' || !COPTIC.test(entry[0]) ||
        !Number.isInteger(entry[1]) || entry[1] < 0 || entry[1] > 3 ||
        seen.has(entry[0])) throw new TypeError('Invalid or duplicate Coptic surface/dialect mask');
    const text = entry[0];
    seen.add(text);
    return {text, key: keyboardKey(text), id: 'cop:' + text,
      dialects: entry[1], frequency: frequency(pack.popularity?.[text]),
      lexicalIdentityVerified: false, source: 'COMPILED-COPTIC'};
  });
  rows.sort((a, b) => collate(a.key, b.key) || collate(a.text, b.text));
  return {language: LANGUAGE, rows};
}

function lowerBound(rows, key) {
  let lo = 0, hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid].key < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Return typed completion candidates. The raw input is always first.
 * `dialect` filters only source-listed words; personal words are clearly
 * labeled and never receive an invented dialect or attestation.
 *
 * `includeEditorial` and `includePhrases` are explicit opt-ins, never
 * enabled by the keyboard UI without the embedding application's consent.
 */
export function predictKeyboard(index, raw, {
  dialect = 'all', learned = {}, previous = '', limit = 4,
  includeEditorial = false, includePhrases = false,
  includePersonal = true, balanced = false
} = {}) {
  if (!index || index.language !== LANGUAGE || !Array.isArray(index.rows))
    throw new TypeError('Invalid Coptic index');
  if (typeof raw !== 'string') throw new TypeError('Coptic input required');
  if (!Number.isInteger(limit) || limit < 1 || limit > 80)
    throw new RangeError('Suggestion limit must be 1–80');
  checkDialect(dialect);
  if (!raw) return [];
  const lookup = keyboardKey(raw);
  const found = new Map();
  let exact = false;
  const consider = (row, personal = false) => {
    if (!row.key.startsWith(lookup) || row.text === raw) return;
    if (!isInsertableSurface(row.text, {includeEditorial, includePhrases})) return;
    if (!personal && !allowed(row.dialects, dialect)) return;
    const learnedN = usage(learned, LANGUAGE + ':' + row.text);
    const contextN = previous ? usage(learned, 'ctx:' + LANGUAGE + ':' + previous + ':' + row.text) : 0;
    const score = Math.log1p(row.frequency) * 8 + Math.log1p(learnedN) * 45 +
      Math.log1p(contextN) * 30 - [...row.text].length * 0.05;
    const candidate = {text: row.text, raw: false, personal,
      attested: !personal, inLexicon: !personal,
      dialects: personal ? 0 : row.dialects, frequency: row.frequency,
      lemma: null, lexicalIdentityVerified: false,
      source: personal ? 'PERSONAL' : row.source,
      lexicon_ref: null, record_key: personal ? null : row.id, score};
    const prior = found.get(row.text);
    if (!prior || (!prior.inLexicon && candidate.inLexicon) ||
        (prior.inLexicon === candidate.inLexicon && candidate.score > prior.score))
      found.set(row.text, candidate);
  };
  for (let i = lowerBound(index.rows, lookup); i < index.rows.length; i++) {
    const row = index.rows[i];
    if (!row.key.startsWith(lookup)) break;
    if (!allowed(row.dialects, dialect)) continue;
    if (row.text === raw) exact = true;
    else consider(row);
  }
  if (includePersonal && learned && typeof learned === 'object') {
    for (const [key, n] of Object.entries(learned)) {
      if (!key.startsWith(LANGUAGE + ':') || !(Number(n) > 0)) continue;
      const text = key.slice(LANGUAGE.length + 1);
      if (!text || text === raw || found.has(text)) continue;
      consider({text, key: keyboardKey(text), id: null, dialects: 0,
        frequency: 0, source: 'PERSONAL'}, true);
    }
  }
  const ranked = [...found.values()].sort((a, b) => b.score - a.score || collate(a.text, b.text));
  const selected = [];
  if (balanced && dialect === 'all' && limit > 2) {
    const sahidic = ranked.find(x => x.inLexicon && (x.dialects & 1));
    const bohairic = ranked.find(x => x.inLexicon && (x.dialects & 2) && x !== sahidic);
    if (sahidic) selected.push(sahidic);
    if (bohairic) selected.push(bohairic);
  }
  for (const row of ranked) {
    if (selected.length >= limit - 1) break;
    if (!selected.includes(row)) selected.push(row);
  }
  return [
    {text: raw, raw: true, personal: false, attested: exact,
      inLexicon: exact, lexicalIdentityVerified: false, lexicon_ref: null},
    ...selected.slice(0, limit - 1).map(({score, ...candidate}) => candidate)
  ];
}
