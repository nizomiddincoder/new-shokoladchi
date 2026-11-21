/**
 * Mahsulot qidiruvi: lotin va kirill yozuvda, katta-kichik harfsiz, oddiy imlo xatolariga chidamli.
 * Ma'lumotlar bazasiga bog'liq emas — faqat matnni solishtirish.
 *
 * Misollar: "киндер" = "kinder", "snickers" = "snikers", "qahva" = "kahva", "shokolad" ~ "shokalad".
 */

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'o', ф: 'f', х: 'x', ҳ: 'h', ц: 's',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Bitta so'zni "ovoz bo'yicha" soddalashtiradi: c/k/q, x/h, w/v, y/i, qo'sh harflar */
function fold(word: string): string {
  return word
    .replace(/ch/g, '\u0001') // "ch" ni saqlab qolamiz
    .replace(/sh/g, '\u0002')
    .replace(/ph/g, 'f')
    .replace(/kh/g, 'h')
    .replace(/ck/g, 'k')
    .replace(/[cq]/g, 'k')
    .replace(/x/g, 'h')
    .replace(/w/g, 'v')
    .replace(/y/g, 'i')
    .replace(/\u0001/g, 'ch')
    .replace(/\u0002/g, 'sh')
    .replace(/(.)\1+/g, '$1');
}

/** Matnni so'zlarga ajratadi (kirill -> lotin, kichik harf, raqam va harf ajratiladi) */
export function searchTokens(text: string): string[] {
  const latin = String(text || '')
    .toLowerCase()
    .split('')
    .map((ch) => CYR[ch] ?? ch)
    .join('')
    .replace(/[‘’ʻʼ`']/g, '')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2');
  return latin
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : fold(w)));
}

/** Damerau–Levenshtein masofasi (max dan oshsa erta to'xtaydi) */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const allowedTypos = (len: number) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

/** So'rovdagi bitta so'zning nomdagi so'zlar bilan eng yaxshi mosligi (0 — mos emas) */
function tokenScore(q: string, nameTokens: string[]): number {
  let best = 0;
  const typos = /^\d+$/.test(q) ? 0 : allowedTypos(q.length);
  for (const n of nameTokens) {
    if (n === q) return 3;
    if (n.startsWith(q)) best = Math.max(best, q.length >= 2 ? 2.2 : 1);
    else if (q.length >= 3 && n.includes(q)) best = Math.max(best, 1.6);
    else if (typos) {
      // Butun so'z yoki so'z boshi (yozilayotgan so'z) bilan imlo xatosi
      const dWhole = distance(q, n, typos);
      const dPrefix = n.length > q.length ? distance(q, n.slice(0, q.length), typos) : typos + 1;
      const dist = Math.min(dWhole, dPrefix);
      if (dist <= typos) best = Math.max(best, 1.4 - dist * 0.3);
    }
  }
  return best;
}

export type Searchable = { names: string[] };

/**
 * Mahsulot nomlari so'rovga qanchalik mos ekanini baholaydi.
 * Har bir so'rov so'zi nomda (yoki yopishtirib yozilgan bo'lsa — butun nomda) topilishi shart. 0 — mos emas.
 */
export function matchScore(queryTokens: string[], names: string[]): number {
  if (!queryTokens.length) return 0;
  let best = 0;
  const compactQ = queryTokens.join('');
  for (const name of names) {
    const nt = searchTokens(name);
    if (!nt.length) continue;
    let sum = 0;
    let ok = true;
    for (const q of queryTokens) {
      const s = tokenScore(q, nt);
      if (!s) {
        ok = false;
        break;
      }
      sum += s;
    }
    let score = ok ? sum / queryTokens.length : 0;
    // "kinderbueno" kabi bo'sh joysiz yozilgan so'rov
    const compactN = nt.join('');
    if (!score && compactQ.length >= 4 && compactN.includes(compactQ)) score = 1.8;
    if (score) {
      // To'liq mos nom va qisqaroq nomlar yuqoriroq
      if (compactN === compactQ) score += 1;
      score += Math.max(0, 0.3 - Math.abs(nt.length - queryTokens.length) * 0.05);
    }
    best = Math.max(best, score);
  }
  return best;
}

export function searchItems<T extends Searchable>(query: string, items: T[], limit = 20): (T & { score: number })[] {
  const q = searchTokens(String(query || '').slice(0, 100)).slice(0, 8);
  if (!q.length) return [];
  const out: (T & { score: number })[] = [];
  for (const it of items) {
    const score = matchScore(q, it.names);
    if (score > 0) out.push({ ...it, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
