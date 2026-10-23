/* Letter Wardrobe: browser port of outfit.py (load wardrobe-data.js first).
   Fixed 1-to-1 table: 28 letters to 28 clothing properties, from tajweed sifat (fabric) and makharij
   (colour). Top = first letter, outerwear = middle letter (cut by its strength), bottom = last letter.
   Letter sounds only; implies nothing about meaning. The avatar is always seen from behind: no face. */
(function (root) {
  const D = typeof LW_DATA !== "undefined" ? LW_DATA : root.LW_DATA;
  const BY_ORDER = {};
  D.letters.forEach((r) => (BY_ORDER[r.order] = r));
  function letterOrders(text) {
    const out = [];
    for (const c of text || "") {
      const i = D.alphabet.indexOf(D.fold[c] || c);
      if (i >= 0) out.push(i + 1);
    }
    return out;
  }
  const wordCount = (t) => (t || "").split(/\s+/).filter((w) => w && letterOrders(w).length).length;
  const garment = (o) => { const r = BY_ORDER[o]; return { letter: r.letter, name: r.name, order: o, property: r.property, colour: r.colour }; };
  function outfitId(s) {
    const key = [s.base.hair, s.top.order, s.bottom.order, s.outerwear.order, s.outerwear.style].join("|");
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(key)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  function outfitFor(text) {
    const real = letterOrders(text), seq = real.length ? real : [1];
    const mi = Math.floor((seq.length - 1) / 2), mid = seq[mi];
    const cls = BY_ORDER[mid].strength.class;
    const words = wordCount(text);
    const spec = {
      schema: D.schema, view: "back",
      base: { skin: "skin", hair: D.hair[words % D.hair.length] },
      top: garment(seq[0]), bottom: garment(seq[seq.length - 1]),
      outerwear: Object.assign(garment(mid), { style: D.cut[cls], strength: cls }),
      rule: "top = first letter, outerwear = middle letter (cut by its strength), bottom = last letter",
      stats: { letters: real.length, words, distinct: new Set(seq).size, middle_index: mi },
      note: "Clothing comes from a fixed table of letter sounds (tajweed makharij/sifat); it implies nothing about meaning.",
    };
    spec.id = outfitId(spec);
    return spec;
  }
  /* W*H array of hex colours (null = transparent); same compositing as outfit.render_avatar. */
  function renderPixels(spec) {
    const { W, H, masks, fixed } = D, N = W * H;
    const px = new Array(N).fill(null), tex = new Array(N).fill(null);
    const paint = (rows, col, g) => rows.forEach((r, y) => { for (let x = 0; x < W; x++) if (r[x] === "1") { px[y * W + x] = col; tex[y * W + x] = g || null; } });
    paint(masks.skin, fixed.skin); paint(masks.hair, fixed[spec.base.hair]); paint(masks.shoes, fixed.shoe);
    paint(masks.bottom, spec.bottom.colour, spec.bottom);
    paint(masks.top, spec.top.colour, spec.top);
    const o = spec.outerwear;
    paint(masks["outer_" + o.style], o.colour, o);
    const out = px.slice();
    for (let i = 0; i < N; i++) {
      const g = tex[i];
      if (!g) continue;
      const s = +D.textures[g.property][Math.floor(i / W)][i % W];
      if (s !== 3) out[i] = D.shades[g.letter][s];
    }
    if (o.style === "longcoat") masks.seam_longcoat.forEach((r, y) => { for (let x = 0; x < W; x++) if (r[x] === "1") out[y * W + x] = fixed.outline; });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (px[y * W + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && px[ny * W + nx]) { out[y * W + x] = fixed.outline; break; }
      }
    }
    return out;
  }
  function paintCanvas(canvas, w, h, cells, scale) {
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cells.forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect((i % w) * scale, Math.floor(i / w) * scale, scale, scale); } });
  }
  function drawAvatar(canvas, spec, scale = 6) { paintCanvas(canvas, D.W, D.H, renderPixels(spec), scale); }
  function drawSwatch(canvas, order, size = 16, scale = 3) {
    const r = BY_ORDER[order], t = D.textures[r.property], sh = D.shades[r.letter], cells = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push(sh[+t[y][x]]);
    paintCanvas(canvas, size, size, cells, scale);
  }
  /* HTML for the 28-row table. highlight: array of orders to mark (e.g. the current ayah's letters). */
  function tableHTML(highlight = []) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const rows = D.letters.map((r) => `<tr data-order="${r.order}" class="${highlight.includes(r.order) ? "lw-hl" : ""}">` +
      `<td>${r.order}</td><td class="lw-ar" lang="ar">${r.letter}</td><td>${esc(r.name)}</td>` +
      `<td><canvas class="lw-sw" data-order="${r.order}"></canvas> ${esc(r.property)}</td>` +
      `<td><span class="lw-dot" style="background:${r.colour}"></span>${r.makhraj}</td>` +
      `<td>${esc(r.sifat.join(", "))}</td><td>${r.strength.class}</td><td class="lw-why">${esc(r.reason)}</td></tr>`).join("");
    return `<table class="lw-table"><thead><tr><th>#</th><th>Letter</th><th>Name</th><th>Property</th><th>Makhraj</th><th>Sifat</th><th>Strength</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderTable(el, highlight) {
    el.innerHTML = tableHTML(highlight);
    el.querySelectorAll("canvas.lw-sw").forEach((c) => drawSwatch(c, +c.dataset.order, 12, 2));
  }
  // Real store items for an outfit (products.json via wardrobe-data.js): [top, outerwear, bottom]. Links only.
  function productsFor(spec) {
    const P = D.products;
    if (!P) return [];
    return ["top", "outerwear", "bottom"].map((s) => Object.assign({ slot: s }, P.by_property[spec[s].property][s]));
  }
  // Plain store search links (no affiliate codes, no images): Temu + Macy's for each slot's "<fabric> <garment>".
  const GARMENT = { top: "top", bottom: "pants", longcoat: "long coat", jacket: "jacket", vest: "vest" };
  const FABRIC = { stripes: "striped", "polka dot": "polka dot" };
  function searchQuery(spec, slot) {
    const g = spec[slot], kind = slot === "outerwear" ? GARMENT[g.style] || "jacket" : GARMENT[slot];
    return `${FABRIC[g.property] || g.property} ${kind}`;
  }
  function searchLinks(spec, slot) {
    const q = searchQuery(spec, slot), e = encodeURIComponent(q);
    return {
      query: q,
      temu: `https://www.temu.com/search_result.html?search_key=${e}`,
      macys: `https://www.macys.com/shop/search?keyword=${e}`,
    };
  }
  function shopHTML(spec) {
    const P = D.products;
    if (!P) return "";
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const lab = { top: "Top", outerwear: "Outer", bottom: "Bottom" };
    const li = productsFor(spec).map((p) =>
      `<li><b>${lab[p.slot]}</b> · ${esc(spec[p.slot].property)}: <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(p.name)}</a>` +
      ` <span class="lw-store">${esc(p.store)} · ${esc(p.price)}</span>${p.note ? ` <span class="muted">(${esc(p.note)})</span>` : ""}` +
      (() => { const L = searchLinks(spec, p.slot); return `<div class="lw-search">Search “${esc(L.query)}”: ` +
        `<a href="${esc(L.temu)}" target="_blank" rel="noopener noreferrer nofollow">Temu <span class="ur" lang="ur">تیمو</span></a> · ` +
        `<a href="${esc(L.macys)}" target="_blank" rel="noopener noreferrer nofollow">Macy's <span class="ur" lang="ur">میسیز</span></a></div>`; })() +
      `</li>`).join("");
    return `<div class="lw-shop-h">Real clothes <span class="ur" lang="ur">اصل کپڑے</span></div><ul>${li}</ul>` +
      `<div class="muted lw-asof">Prices as of Oct 21, 2026, may change. Links only, no store photos. Temu and Macy's buttons are plain store searches. ${esc(P.note.replace(/^Prices as of [^.]*\. Links only \(no retailer images\)\. /, ""))}</div>`;
  }
  const api = { outfitFor, productsFor, searchQuery, searchLinks, shopHTML, renderPixels, drawAvatar, drawSwatch, tableHTML, renderTable, letterOrders, outfitId, data: D };
  root.LetterWardrobe = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
