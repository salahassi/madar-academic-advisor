import { cleanPhonemes, EXTRA_SYMBOLS, isDiacritized, normalizeText } from './arabic.mjs';
import { espeakPhonemize } from './espeak.mjs';
import { VOCAB } from '../vocab.mjs';
export { cleanPhonemes, isDiacritized, normalizeText, EXTRA_SYMBOLS } from './arabic.mjs';
export { initEspeak } from './espeak.mjs';
export const MAX_PHONEMES = 510;
const CHUNK_SIZE = 400;
const TOKENS = {
    ...VOCAB,
    ...EXTRA_SYMBOLS
};
const cpLength = (s)=>Array.from(s).length;
export async function phonemize(text) {
    return cleanPhonemes(await espeakPhonemize(text));
}
export function tokenize(phonemes) {
    const ids = [
        0
    ];
    for (const ch of phonemes){
        const id = TOKENS[ch];
        if (id !== undefined) ids.push(id);
    }
    ids.push(0);
    return ids;
}
export function splitText(text) {
    const out = [];
    for (const graphemes of text.trim().split(/\n+/)){
        if (!graphemes.trim()) continue;
        const sentences = graphemes.split(/([.!?]+)/);
        const chunks = [];
        let current = '';
        for(let i = 0; i < sentences.length; i += 2){
            let sentence = sentences[i];
            if (i + 1 < sentences.length) sentence += sentences[i + 1];
            if (cpLength(current) + cpLength(sentence) <= CHUNK_SIZE) {
                current += sentence;
            } else {
                if (current) chunks.push(current.trim());
                current = sentence;
            }
        }
        if (current) chunks.push(current.trim());
        if (!chunks.length) {
            const cps = Array.from(graphemes);
            for(let i = 0; i < cps.length; i += CHUNK_SIZE)chunks.push(cps.slice(i, i + CHUNK_SIZE).join(''));
        }
        out.push(...chunks.filter((c)=>c.trim()));
    }
    return out;
}
export async function prepare(text, opts = {}) {
    const chunks = [];
    for (let graphemes of splitText(text)){
        if (opts.normalize) graphemes = normalizeText(graphemes);
        let g2pInput = graphemes;
        if (opts.diacritize && !isDiacritized(graphemes)) g2pInput = await opts.diacritize(graphemes);
        let cps = Array.from(await phonemize(g2pInput));
        if (!cps.length) continue;
        if (cps.length > MAX_PHONEMES) cps = cps.slice(0, MAX_PHONEMES);
        const phonemes = cps.join('');
        chunks.push({
            graphemes,
            phonemes,
            inputIds: tokenize(phonemes),
            styleIndex: cps.length - 1
        });
    }
    return chunks;
}
