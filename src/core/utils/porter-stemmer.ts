/**
 * Porter Stemming Algorithm (Porter, 1980)
 * Only processes ASCII alphabetic tokens. All other tokens pass through unchanged.
 * Reference: https://tartarus.org/martin/PorterStemmer/
 */

const VOWELS = /[aeiou]/;
const VOWEL_IN_STEM = /[aeiou]|[^aeiou][aeiou]/; // vowel or consonant followed by vowel

/** True if character at position i is a consonant in word. */
function isConsonant(word: string, i: number): boolean {
    const c = word[i];
    if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') return false;
    if (c === 'y') return i === 0 || !isConsonant(word, i - 1);
    return true;
}

/**
 * Compute the "measure" m of a word: number of VC sequences (consonant-run then vowel-run).
 */
function measure(stem: string): number {
    let m = 0;
    let i = 0;
    const n = stem.length;
    // skip leading consonants
    while (i < n && isConsonant(stem, i)) i++;
    while (i < n) {
        // skip vowels
        while (i < n && !isConsonant(stem, i)) i++;
        m++;
        // skip consonants
        while (i < n && isConsonant(stem, i)) i++;
    }
    return m;
}

/** True if stem contains at least one vowel. */
function containsVowel(stem: string): boolean {
    for (let i = 0; i < stem.length; i++) {
        if (!isConsonant(stem, i)) return true;
    }
    return false;
}

/** True if stem ends with a double consonant (e.g. "tt", "ss"). */
function endsDoubleConsonant(stem: string): boolean {
    const n = stem.length;
    return n >= 2 && stem[n - 1] === stem[n - 2] && isConsonant(stem, n - 1);
}

/** True if stem ends with CVC where the final C is not w, x, or y. */
function endsCVC(stem: string): boolean {
    const n = stem.length;
    if (n < 3) return false;
    return (
        isConsonant(stem, n - 1) &&
        !isConsonant(stem, n - 2) &&
        isConsonant(stem, n - 3) &&
        stem[n - 1] !== 'w' &&
        stem[n - 1] !== 'x' &&
        stem[n - 1] !== 'y'
    );
}

// ─── Steps ───────────────────────────────────────────────────────────────────

function step1a(word: string): string {
    if (word.endsWith('sses')) return word.slice(0, -2);
    if (word.endsWith('ies'))  return word.slice(0, -2);
    if (word.endsWith('ss'))   return word;
    if (word.endsWith('s'))    return word.slice(0, -1);
    return word;
}

function step1b(word: string): string {
    if (word.endsWith('eed')) {
        const stem = word.slice(0, -3);
        if (measure(stem) > 0) return stem + 'ee';
        return word;
    }
    if (word.endsWith('ed')) {
        const stem = word.slice(0, -2);
        if (containsVowel(stem)) return step1bFix(stem);
        return word;
    }
    if (word.endsWith('ing')) {
        const stem = word.slice(0, -3);
        if (containsVowel(stem)) return step1bFix(stem);
        return word;
    }
    return word;
}

function step1bFix(stem: string): string {
    if (stem.endsWith('at') || stem.endsWith('bl') || stem.endsWith('iz')) return stem + 'e';
    if (endsDoubleConsonant(stem)) {
        const last = stem[stem.length - 1];
        if (last !== 'l' && last !== 's' && last !== 'z') return stem.slice(0, -1);
    }
    if (measure(stem) === 1 && endsCVC(stem)) return stem + 'e';
    return stem;
}

function step1c(word: string): string {
    if (word.endsWith('y')) {
        const stem = word.slice(0, -1);
        if (containsVowel(stem)) return stem + 'i';
    }
    return word;
}

// Step 2: map derivational suffixes (m > 0)
const STEP2_MAP: [string, string][] = [
    ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
    ['izer', 'ize'],   ['abli', 'able'],   ['alli', 'al'],    ['entli', 'ent'],
    ['eli', 'e'],      ['ousli', 'ous'],   ['ization', 'ize'], ['ation', 'ate'],
    ['ator', 'ate'],   ['alism', 'al'],    ['iveness', 'ive'], ['fulness', 'ful'],
    ['ousness', 'ous'], ['aliti', 'al'],   ['iviti', 'ive'],   ['biliti', 'ble'],
];

function step2(word: string): string {
    for (const [suffix, replacement] of STEP2_MAP) {
        if (word.endsWith(suffix)) {
            const stem = word.slice(0, -suffix.length);
            if (measure(stem) > 0) return stem + replacement;
            return word;
        }
    }
    return word;
}

// Step 3: map derivational suffixes (m > 0)
const STEP3_MAP: [string, string][] = [
    ['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'],
    ['ical', 'ic'],  ['ful', ''],   ['ness', ''],
];

function step3(word: string): string {
    for (const [suffix, replacement] of STEP3_MAP) {
        if (word.endsWith(suffix)) {
            const stem = word.slice(0, -suffix.length);
            if (measure(stem) > 0) return stem + replacement;
            return word;
        }
    }
    return word;
}

// Step 4: remove derivational suffixes (m > 1)
const STEP4_SUFFIXES = [
    'ement', 'ment', 'ance', 'ence', 'able', 'ible', 'ism',
    'ate', 'iti', 'ous', 'ive', 'ize', 'ant', 'ent',
    'ion', 'al', 'er', 'ic',
];

function step4(word: string): string {
    for (const suffix of STEP4_SUFFIXES) {
        if (word.endsWith(suffix)) {
            const stem = word.slice(0, -suffix.length);
            if (suffix === 'ion') {
                // special case: stem must end with s or t
                if (measure(stem) > 1 && (stem.endsWith('s') || stem.endsWith('t'))) return stem;
                return word;
            }
            if (measure(stem) > 1) return stem;
            return word;
        }
    }
    return word;
}

function step5a(word: string): string {
    if (word.endsWith('e')) {
        const stem = word.slice(0, -1);
        const m = measure(stem);
        if (m > 1) return stem;
        if (m === 1 && !endsCVC(stem)) return stem;
    }
    return word;
}

function step5b(word: string): string {
    if (endsDoubleConsonant(word) && word.endsWith('l') && measure(word.slice(0, -1)) > 1) {
        return word.slice(0, -1);
    }
    return word;
}

// ─── Public API ──────────────────────────────────────────────────────────────

const ENGLISH_ONLY = /^[a-zA-Z]+$/;

/**
 * Stem a single word using the Porter algorithm.
 * Non-English tokens (CJK, digits, mixed, empty) pass through unchanged.
 */
export function porterStem(word: string): string {
    if (!word || !ENGLISH_ONLY.test(word)) return word;
    if (word.length <= 2) return word.toLowerCase();

    let w = word.toLowerCase();
    w = step1a(w);
    w = step1b(w);
    w = step1c(w);
    w = step2(w);
    w = step3(w);
    w = step4(w);
    w = step5a(w);
    w = step5b(w);
    return w;
}

/**
 * Stem all whitespace-delimited tokens in text.
 * English tokens are stemmed; all others pass through unchanged.
 */
export function stemText(text: string): string {
    return text
        .split(/(\s+)/)
        .map(token => (/^\s+$/.test(token) ? token : porterStem(token)))
        .join('');
}
