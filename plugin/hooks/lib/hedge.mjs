// Hedge-cluster check for project deliverables. A hedge is a word that softens a claim without changing it; one
// functional qualifier is fine, a pile of them reads as templated model prose. Only hedges a write ADDS count.

const EN_HEDGES = [
  /\b(?:could|may|might)\s+(?:possibly|potentially|perhaps|arguably)\b/gi,
  /\b(?:perhaps|possibly|potentially|arguably|presumably|seemingly|somewhat|relatively|generally|typically|probably|likely)\b/gi,
  /\b(?:it seems|seems to|appears to|tends to|to some extent|in some cases|in many cases|to a certain degree)\b/gi,
  /\b(?:could|might)\b/gi,
];
const KO_HEDGES = [
  /것으로\s*(?:보인다|보입니다|보여요|추정됩니다|판단됩니다|생각됩니다)|(?:인|할|될)\s*듯\s*(?:하다|합니다|하며)|것\s*같(?:다|습니다|아요)/g,
  /수도\s*있|수\s*있을\s*것|가능성이\s*있/g,
  /다소|어느\s*정도|대체로|일반적으로|아마도?|어쩌면|비교적/g,
];
const SENTENCE_LIMIT = 2;
const PARAGRAPH_LIMIT = 4;

function paragraphs(text) {
  let inFence = false;
  const out = [];
  let current = [];
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence || /^\s*>/.test(line)) continue;
    if (!line.trim()) { if (current.length) out.push(current.join(' ')); current = []; continue; }
    current.push(line);
  }
  if (current.length) out.push(current.join(' '));
  return out;
}

const sentences = (p) => p.split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean);

// Counts hedge words in a sentence. The patterns overlap on purpose ("could possibly" is two hedges), so each
// character span is claimed once: a longer match consumes the shorter ones inside it, except the phrase counts twice
// when it joins a modal to an adverb.
export function hedgeCount(sentence) {
  let count = 0;
  let rest = sentence;
  for (const pattern of [...EN_HEDGES, ...KO_HEDGES]) {
    const hits = rest.match(pattern);
    if (!hits) continue;
    count += hits.length + (pattern === EN_HEDGES[0] ? hits.length : 0);
    rest = rest.replace(pattern, ' ');
  }
  return count;
}

// Returns {snippet, count} for the first paragraph the write turns into a hedge cluster, else null. Sentences already
// in the file (or in the replaced text) belong to the writer and are not counted.
export function addedHedgeCluster(newText, existingText = '') {
  const existing = new Set(paragraphs(existingText).flatMap(sentences));
  for (const p of paragraphs(newText)) {
    const fresh = sentences(p).filter((s) => !existing.has(s));
    const counts = fresh.map(hedgeCount);
    const total = counts.reduce((a, b) => a + b, 0);
    if (counts.some((c) => c >= SENTENCE_LIMIT) || total >= PARAGRAPH_LIMIT) {
      return { snippet: fresh.join(' ').slice(0, 160), count: total };
    }
  }
  return null;
}

export const HEDGE_MESSAGE = 'Keep the one qualifier that changes the claim and state the rest plainly; say what is known, then name the single open point once.';
