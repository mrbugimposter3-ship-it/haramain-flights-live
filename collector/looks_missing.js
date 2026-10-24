// Lists the outfits currently shown (today's card + Hijri month, Gregorian month and season cards) whose photo-realistic
// look image site/looks/<outfit-id>.jpg is missing, writes site/looks/missing.json and refreshes site/looks/index.json
// (the list of images that exist, read by the site so a missing image never 404s), and prints an image prompt for each.
// Run after collector/build.py:   node collector/looks_missing.js            (add --all-prompts to print prompts for every card)
// Then generate each image (adult model seen from BEHIND, face not visible, modest full-length, plain studio background, no logos,
// AI-generated, never a photo of a real person), compress to JPEG < 300 KB, 576x768 (3:4), save as site/looks/<id>.jpg and rerun this script.
const fs = require('fs'), path = require('path'), vm = require('vm');
const site = path.join(__dirname, '..', 'site'), LOOKS = path.join(site, 'looks');
vm.runInThisContext(fs.readFileSync(path.join(site, 'wardrobe-data.js'), 'utf8').replace('const LW_DATA', 'globalThis.LW_DATA'));
const W = require(path.join(site, 'wardrobe.js')), P = require(path.join(site, 'periods.js')), AS = require(path.join(site, 'astro.js'));
const DC = JSON.parse(fs.readFileSync(path.join(site, 'data', 'daycounts.json'))), IDX = JSON.parse(fs.readFileSync(path.join(site, 'quran', 'index.json')));
const COLOUR = { '#f4ecd8': 'cream', '#d4a72c': 'mustard gold', '#9a5e2c': 'rust brown', '#b2682c': 'copper orange', '#3d7f58': 'forest green',
  '#416a99': 'steel blue', '#387494': 'deep teal blue', '#8f6a2a': 'bronze brown', '#a5522e': 'terracotta', '#547c43': 'moss green',
  '#c07f2a': 'ochre', '#2f7f8f': 'petrol teal', '#367f74': 'jade green', '#6b7a2e': 'olive green', '#7d722c': 'khaki olive', '#4a5f9e': 'indigo blue' };
const HAIR = { hair_dark: 'short dark brown', hair_brown: 'short medium brown', hair_charcoal: 'short charcoal-black' };
const CUT = { longcoat: 'long ankle-length coat', jacket: 'hip-length jacket', vest: 'long sleeveless vest' };
function spec(surah, ayah) {
  const d = JSON.parse(fs.readFileSync(path.join(site, 'quran', String(surah).padStart(3, '0') + '.json'))), L = d.lw[ayah - 1], by = {};
  W.data.letters.forEach((r) => (by[r.order] = r));
  const g = (o) => { const r = by[o]; return { letter: r.letter, name: r.name, order: o, property: r.property, colour: r.colour }; };
  const cls = by[L[1]].strength.class;
  const s = { schema: W.data.schema, view: 'back', base: { skin: 'skin', hair: W.data.hair[L[3] % W.data.hair.length] }, top: g(L[0]), bottom: g(L[2]),
    outerwear: Object.assign(g(L[1]), { style: W.data.cut[cls], strength: cls }) };
  s.id = W.outfitId(s); return s;
}
function prompt(s) {
  const c = (x) => COLOUR[x.colour] || x.colour, f = (x) => ({ stripes: 'striped' })[x.property] || x.property;
  return `Photorealistic fashion catalogue photo of one adult model seen from directly behind (back view, face completely hidden, head facing away), ` +
    `full-length, standing, modest loose-fitting clothes covering arms and legs: a ${c(s.outerwear)} ${f(s.outerwear)} ${CUT[s.outerwear.style]} ` +
    `worn over a ${c(s.top)} ${f(s.top)} long-sleeved top (visible at the cuffs and collar), and loose full-length ${c(s.bottom)} ${f(s.bottom)} trousers, ` +
    `plain dark leather shoes, ${HAIR[s.base.hair]} hair. Plain light grey seamless studio background, soft even lighting, no logos, no text, no jewellery, ` +
    `not a real or identifiable person.`;
}
const t = P.ksaDate(new Date()), cards = [];
const dm = P.dayModes(DC, t); if (dm) cards.push({ card: 'today', date: t, ...dm });
for (const p of P.periods(t, AS)) { const m = P.modes(DC, p.start, p.end); if (m) cards.push({ card: p.id, period: p.name, start: p.start, ...m }); }
const have = new Set(fs.existsSync(LOOKS) ? fs.readdirSync(LOOKS).filter((f) => /^[0-9a-f]{8}\.jpg$/.test(f)).map((f) => f.slice(0, 8)) : []);
const missing = {}, all = process.argv.includes('--all-prompts');
for (const c of cards) {
  const sa = P.surahAyah(c.a, c.k, IDX.ayahs), s = spec(sa.surah, sa.ayah);
  Object.assign(c, { surah: sa.surah, ayah: sa.ayah, outfit: s.id, has_image: have.has(s.id),
    pieces: { top: W.searchQuery(s, 'top'), outerwear: W.searchQuery(s, 'outerwear'), bottom: W.searchQuery(s, 'bottom') } });
  if (!c.has_image) (missing[s.id] = missing[s.id] || { id: s.id, file: `site/looks/${s.id}.jpg`, cards: [], prompt: prompt(s) }).cards.push(c.card);
  console.log(`${c.card.padEnd(7)} ${String(c.period || c.date).padEnd(24)} n=${c.n} a=${c.a} k=${c.k} -> ${sa.surah}:${sa.ayah} outfit ${s.id} ${c.has_image ? 'has image' : 'MISSING'}`);
  if (all) console.log('   ' + prompt(s));
}
fs.mkdirSync(LOOKS, { recursive: true });
fs.writeFileSync(path.join(LOOKS, 'index.json'), JSON.stringify({ ids: [...have].sort() }));
fs.writeFileSync(path.join(LOOKS, 'missing.json'), JSON.stringify({ checked_ksa_date: t, cards, missing: Object.values(missing) }, null, 1));
const mv = Object.values(missing);
console.log(mv.length ? `\n${mv.length} missing:\n` + mv.map((m) => `${m.file}  (${m.cards.join(', ')})\n  ${m.prompt}`).join('\n') : '\nAll current outfits have images.');
