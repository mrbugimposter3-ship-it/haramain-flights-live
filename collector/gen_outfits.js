// Adds "lw" to site/quran/NNN.json: per ayah [topOrder, middleOrder, bottomOrder, words, letters], computed with
// Quran Recorder's own wardrobe.js (copied to site/) over Quran Recorder's own quran-text.js at a pinned commit,
// so both apps give the identical Letter Wardrobe outfit for the same ayah (its text edition differs slightly from alquran.cloud).
// Run: node collector/gen_outfits.js   (reads quran-recorder read-only over HTTPS; never writes to it)
const fs = require('fs'), path = require('path'), vm = require('vm');
const QR = '6bac6591534781796524ea1de0bb9f850f847134';
const site = path.join(__dirname, '..', 'site');
vm.runInThisContext(fs.readFileSync(path.join(site, 'wardrobe-data.js'), 'utf8').replace('const LW_DATA', 'globalThis.LW_DATA'));
const W = require(path.join(site, 'wardrobe.js'));
(async () => {
  const t = await (await fetch(`https://raw.githubusercontent.com/mrbugimposter3-ship-it/quran-recorder/${QR}/docs/quran-text.js`)).text();
  const Q = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  for (let s = 1; s <= 114; s++) {
    const f = path.join(site, 'quran', String(s).padStart(3, '0') + '.json'), d = JSON.parse(fs.readFileSync(f));
    if (Q[s].length !== d.ar.length) throw new Error('count ' + s);
    d.lw = Q[s].map((x) => { const o = W.outfitFor(x); return [o.top.order, o.outerwear.order, o.bottom.order, o.stats.words, o.stats.letters]; });
    d.lw_src = 'Quran Recorder wardrobe.js + quran-text.js @' + QR.slice(0, 7);
    fs.writeFileSync(f, JSON.stringify(d));
  }
  console.log('ok');
})();
