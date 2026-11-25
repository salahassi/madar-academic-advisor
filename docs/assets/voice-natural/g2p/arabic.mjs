export const ARABIC_PHONEME_FIXUPS = {
    '̪': '',
    'ˤ': '',
    '[': '',
    ']': '',
    '{': '',
    '}': ''
};
export const EXTRA_SYMBOLS = {
    ʕ: 7,
    ħ: 8
};
const SYLLABLE_DOT = /(?<=\S)\.(?=\S)/g;
const LATIN_RUN = /[A-Za-z]+/g;
const CITATION = /\[[^\]]*\]/g;
const WS = /\s+/g;
const TASHKEEL = /[ً-ْٰ]/g;
const ARABIC_LETTER = /[ء-ي]/g;
export function isDiacritized(text, minRatio = 0.2) {
    const letters = text.match(ARABIC_LETTER)?.length ?? 0;
    const marks = text.match(TASHKEEL)?.length ?? 0;
    return letters > 0 && marks / letters >= minRatio;
}
export function normalizeText(text) {
    return text.replace(CITATION, ' ').replace(LATIN_RUN, ' ').replace(WS, ' ').trim();
}
export function cleanPhonemes(ps) {
    ps = ps.replace(SYLLABLE_DOT, '');
    for (const [from, to] of Object.entries(ARABIC_PHONEME_FIXUPS))ps = ps.split(from).join(to);
    return ps;
}
