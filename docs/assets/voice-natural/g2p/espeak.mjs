import { preserve, restore } from './punctuation.mjs';
const PHONEME_MODE = 0x02 | 1 << 7 | 0x0361 << 8;
const E2M = Object.entries({
    'a^ɪ': 'I',
    'a^ʊ': 'W',
    'd^z': 'ʣ',
    'd^ʒ': 'ʤ',
    'e^ɪ': 'A',
    'o^ʊ': 'O',
    'ə^ʊ': 'Q',
    's^s': 'S',
    't^s': 'ʦ',
    't^ʃ': 'ʧ',
    'ɔ^ɪ': 'Y'
}).sort(([a], [b])=>a < b ? -1 : a > b ? 1 : 0);
let modulePromise = null;
function loadEspeak() {
    modulePromise ??= import('../vendor/espeak-ng-ar.mjs').then(async ({ default: createEspeak })=>{
        const mod = await createEspeak();
        const rc = mod.ccall('nabra_init', 'number', [
            'string',
            'string'
        ], [
            '/espeak-ng-data',
            'ar'
        ]);
        if (rc !== 0) throw new Error(`espeak-ng init failed (${rc})`);
        return mod;
    });
    return modulePromise;
}
export async function initEspeak() {
    await loadEspeak();
}
const replaceAll = (s, a, b)=>s.split(a).join(b);
function postprocessLine(line) {
    line = replaceAll(line.trim().replace(/\n/g, ' '), '  ', ' ');
    line = line.replace(/_+/g, '_').replace(/_ /g, ' ');
    line = line.replace(/\(.+?\)/g, '');
    if (!line) return '';
    let out = '';
    for (const word of line.split(' '))out += replaceAll(word.trim(), '͡', '^') + ' ';
    return out;
}
export async function espeakPhonemize(text) {
    const mod = await loadEspeak();
    text = text.replace(/«/g, '“').replace(/»/g, '”');
    text = text.replace(/\(/g, '«').replace(/\)/g, '»');
    const [chunks, marks] = preserve([
        text
    ]);
    const phonemized = chunks.map((chunk)=>postprocessLine(mod.ccall('nabra_text_to_phonemes', 'string', [
            'string',
            'number'
        ], [
            chunk,
            PHONEME_MODE
        ])));
    const restored = restore(phonemized, marks);
    if (!restored.length) return '';
    let ps = restored[0].trim();
    for (const [a, b] of E2M)ps = replaceAll(ps, a, b);
    ps = replaceAll(ps, '^', '');
    ps = replaceAll(ps, '-', '');
    return ps.replace(/«/g, '(').replace(/»/g, ')');
}
