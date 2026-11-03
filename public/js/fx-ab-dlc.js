// 黯月初升、夢殞春宵的技能演出：和暗流湧動同一套規矩（總則見 fx-ab.js 開頭），只有不是暗流湧動的房間才下載。
// 自己的戲：壓暗 → 信物從自己的牌裏升起 → 每個角色自己的一套（不靠連線）→ 答案落在桌心停一會 → 收進面板，或落到對應座位旁邊。
// 不露餡：賭徒、教授、驅魔人只演出手，不演結果；舞蛇人沒換到一樣只演出手，換到惡魔自己當場知道，就地換牌。
// 被選中的人什麼都不演，規則要他知道的（被驅魔、瘋狂、換角色、雙子）才有自己的一段，
// 而且不從哪個座位來：換角色的東西都從桌心來，不洩露是誰幹的。口頭發動的（造謠者、雜耍藝人、月之子、呆瓜、博學者、藝術家）不演。
import { PROPS_DLC } from './props-dlc.js';

export { PROPS_DLC };

export function dlcFx(T) {
  const { wait, anim, sfx, h, roleToken, icon, roleIcon, C, col, teamCol, TAU, rand, SELF_WASH, EVIL_WASH, PUB_WASH, getStage, release, W, at, inward, above, later, scene, svgEl, sticker, chip, put,
    dot, place, posOf, cen, fade, stop, develop, impress, burst, trail, puff, wisp, flecks, motes, flames, clods, wash, finish, beat, ring, squash, wiggle, blot, lift, tokOf, flipTo, moveTo,
    emerge, spotStamp, seatStamp, mk, hold, toHud, toSeat, toSeats, drip, fly, stFly, stKill, atkChip } = T;
  const k = n => T.tk * n; // 尺寸都按一張座位牌的寬度算（每段開始時才量）
  const mark = src => `[data-act="${src}"]`;
  const rOf = id => `[data-r="${id}"]`;
  const others = (ids, me) => (ids || []).filter(id => id && id !== me);
  const big = () => Math.max(20, k(0.5));
  // 開場：壓暗，自己的牌浮起來跳一下，目標的牌浮到壓暗上面
  const cast = (me, to, c = SELF_WASH, ms) => { wash(c, ms); lift(me); return to.map(id => (id === me ? tokOf(id) : lift(id, true))); };
  // 幾個人身上同時蓋章，章縮到座位底下那枚行動標記上
  const stamps = (ids, word, tone, src, o = {}) => Promise.all(ids.map(async (id, i) => { await wait(i * 120); await seatStamp(id, word, tone, { mark: mark(src), ...o }); }));
  // 桌心的答案：蓋章，停一會，收進左上角面板。to：收進去的不是章而是這張牌
  async function answer(parts, text, tone, { soft, dy = 1.05, mote, to } = {}) {
    const m = T.mid, st = await spotStamp({ x: m.x, y: m.y + k(dy) }, text, tone, { fs: big(), soft }), p = st.parentElement;
    await hold([...parts, p], mote || (tone === 'evil' ? 'evil' : 'paper'));
    parts.filter(x => x !== to).forEach(x => fade(x, 300));
    if (to) fade(p, 240);
    await toHud([to || p]);
    await finish();
  }
  // 信物傾倒：保持現在的縮放，只轉角度
  const tip = (el, to, ms = 230) => { const a = el._rot || 0, s = el._s ?? 1; anim(el, [{ transform: `rotate(${a}deg) scale(${s})` }, { transform: `rotate(${to}deg) scale(${s})` }], { duration: ms, easing: 'cubic-bezier(.4,0,.3,1)' }); el._rot = to; };
  const flipX = el => { el.querySelector('svg').style.transform = 'scaleX(-1)'; };
  // 一串液體澆到 p 上，落一滴牌挨一下
  async function pour(a, p, tone, tt, n = 6) {
    for (let i = 0; i < n; i++) {
      drip(a, { x: p.x + rand(-0.12, 0.12) * T.tk, y: p.y - k(0.1) }, tone, 200);
      later(200, () => { squash(tt, 0.25 + i * 0.05); burst(p.x, p.y - k(0.15), tone, { n: 4, R: k(0.45), keep: false, dir: -Math.PI / 2, spread: Math.PI * 1.4, big: 0.6 }); });
      await wait(i < 2 ? 110 : 70);
    }
    await wait(200);
  }
  // 飄起來的小東西：愛心、音符
  function floatUp(name, tone, x, y, d, ms = 780) {
    const el = put(sticker(name, tone), x, y, d);
    el.style.opacity = 0;
    anim(el, [{ transform: 'scale(.2)', opacity: 0 }, { transform: `translateY(${-k(0.12)}px) scale(1)`, opacity: 1, offset: 0.3 }, { transform: `translate(${rand(-10, 10)}px, ${-k(0.6)}px) scale(.7)`, opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }
  // 打瞌睡：Z 一個比一個大，飄上去
  function snooze(q, n = 3) {
    for (let i = 0; i < n; i++) {
      later(i * 240, () => {
        const z = put(h('b', { class: 'ab-z', style: { fontSize: k(0.22 + i * 0.09) + 'px' } }, 'Z'), q.x + k(0.2) + i * k(0.14), q.y - k(0.25) - i * k(0.14), k(0.3));
        z.style.opacity = 0;
        anim(z, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.3 }, { transform: `translateY(${-k(0.3)}px) scale(1.1)`, opacity: 0 }], { duration: 1000, easing: 'ease-out' });
      });
    }
  }
  // 花瓣：左右擺著飄落
  function petals(x, y, n = 10, tone = 'evil', R = 1) {
    for (let i = 0; i < n; i++) {
      const d = k(rand(0.1, 0.18)), el = h('i', { class: 'ab-petal', style: { '--c': col(tone), left: x - d / 2 + 'px', top: y - d / 2 + 'px', width: d + 'px', height: d * 0.7 + 'px' } });
      getStage().append(el);
      const a = rand(-Math.PI, 0), L = k(rand(0.3, 1.05)) * R, sw = k(rand(0.12, 0.3)), fall = k(rand(0.5, 1.1)), r0 = rand(-90, 90);
      anim(el, Array.from({ length: 9 }, (_, q) => { const t = q / 8, out = 1 - (1 - t) ** 3;
        return { offset: t, opacity: t > 0.75 ? (1 - t) * 4 : 1, transform: `translate(${Math.cos(a) * L * out + Math.sin(t * Math.PI * 2.4) * sw}px, ${Math.sin(a) * L * out + fall * t * t}px) rotate(${r0 + t * 300}deg)` }; }), { duration: rand(900, 1300), easing: 'linear' });
    }
  }
  // 蛇形走位：沿直線左右扭著過去，頭跟著擺
  async function slither(el, b, ms) {
    const a = posOf(el), dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, amp = k(0.32);
    anim(el, Array.from({ length: 17 }, (_, i) => { const t = i / 16, off = Math.sin(t * Math.PI * 3) * amp * (1 - t * 0.5);
      return { offset: t, transform: `translate(${dx * t + nx * off}px, ${dy * t + ny * off}px) rotate(${Math.cos(t * Math.PI * 3) * 22}deg)` }; }), { duration: ms, easing: 'linear' });
    await wait(ms);
    stop(el); place(el, b); el.style.transform = ''; el._rot = 0; el._s = 1;
  }
  // 護圈：雙線的一圈，刺客一刀劈碎
  function dome(p) {
    const d = k(1.4), bw = Math.max(2, k(0.045)), el = h('i', { class: 'ab-ring', style: { '--c': C.good, left: p.x - d / 2 + 'px', top: p.y - d / 2 + 'px', width: d + 'px', height: d + 'px', borderWidth: bw + 'px', boxShadow: `inset 0 0 0 ${bw}px ${C.paper}, inset 0 0 0 ${bw * 2}px ${C.good}` } });
    getStage().append(el);
    anim(el, [{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.3,.8,.4,1)' });
    return el;
  }
  // 地上裂開一個坑（墊在牌下面）
  function pit(g, w = 1.3) {
    const el = put(h('i', { class: 'ab-hole' }), g.x, g.y, k(w), k(w * 0.34), 'under');
    el.style.scale = 0;
    anim(el, [{ scale: '0' }, { scale: '1.08', offset: 0.7 }, { scale: '1' }], { duration: 340, easing: 'ease-out' });
    later(340, () => { el.style.scale = 1; });
    clods(g.x, g.y, { n: 8 });
    return el;
  }
  // 惡魔圓牌 + ✓ / ✗（占卜師那一枚）；落到座位旁邊的標記上
  const disc = (tone, glyph, mk2) => h('div', { class: 'ab-disc', style: { borderColor: col(tone), color: col(tone) } }, glyph, mk2 && h('div', { class: 'ab-badge', style: { background: col(tone) } }, icon(mk2)));
  const roleCard = (id, x, y, s) => put(roleToken(id), x, y, s);
  // 揮一刀：一道墨線閃過
  function slashAt(p) {
    const el = put(h('i', { class: 'ab-slash' }), p.x, p.y, k(1.7), k(0.09));
    el.style.rotate = '-32deg';
    anim(el, [{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.5 }, { transform: 'scaleX(1.05) scaleY(.2)', opacity: 0 }], { duration: 260, easing: 'ease-out' });
  }

  // ———— 黯月初升：選人 ————
  // 水手：船錨掄出去砸在目標面前，兩隻酒杯一碰（誰醉只有說書人知道）
  const sailor = scene(async (e, me) => {
    const ti = e.to[0], self = ti === me, p = at(ti), m = at(me);
    cast(me, [ti]);
    await wait(320);
    const a = await emerge('anchor', 'brass', me, { size: k(1.15), snd: 'clang' });
    tip(a, -26, 240);
    await wait(280);
    const q = inward(ti, 0.8);
    await fly(a, { x: q.x, y: q.y - k(1.6) }, 460, 'brass', { rot: 0, lift: W() * 0.16 });
    await wait(100);
    await moveTo(a, q, 120, { lift: 0, ease: 'cubic-bezier(.8,0,1,.4)' });
    sfx('thud'); sfx('clang'); impress('anchor', 'brass', a); ring(q.x, q.y, 'brass', k(1.2), 1.9); squash(tokOf(ti), 0.6);
    burst(q.x, q.y + k(0.3), 'paper', { n: 12, R: k(0.9), keep: false, big: 0.6, dir: -Math.PI / 2, spread: Math.PI * 1.2 });
    await wait(320);
    const c = { x: q.x, y: q.y - k(1.1) }, l = put(sticker('beer-stein', 'brass'), m.x, m.y, k(0.72)), r = self ? null : put(sticker('beer-stein', 'brass'), p.x, p.y, k(0.72));
    if (r) flipX(r);
    sfx('whoosh', 0.6);
    await Promise.all([moveTo(l, { x: c.x - (r ? k(0.33) : 0), y: c.y }, 440, { lift: k(0.6), rot: r ? 16 : 0 }), r && moveTo(r, { x: c.x + k(0.33), y: c.y }, 440, { lift: k(0.6), rot: -16 })]);
    sfx('clang', 0.7); ring(c.x, c.y, 'paper', k(0.9), 1.7, 380);
    burst(c.x, c.y - k(0.25), 'paper', { n: 14, R: k(0.8), keep: false, big: 0.7, dir: -Math.PI / 2, spread: Math.PI });
    [l, r].forEach(x => x && squash(x, 0.7));
    await wait(420);
    await seatStamp(ti, '對飲', 'brass', { mark: mark('sailor') });
    await finish();
  });

  // 驅魔人：聖水瓶搖一搖，飛到目標頭頂一傾，水澆下去，白霧騰起。選中的是不是惡魔都一樣
  const exorcist = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti]);
    await wait(320);
    const v = await emerge('holy-water', 'good', me, { size: k(1.05), snd: 'shimmer' });
    sfx('rattle'); wiggle(v, 1.2);
    await wait(360);
    await fly(v, { x: p.x - k(0.32), y: p.y - k(1.5) }, 520, 'good', { rot: 18, lift: W() * 0.14 });
    tip(v, 128);
    await wait(240);
    await pour({ x: p.x + k(0.1), y: p.y - k(1) }, p, 'good', tt);
    sfx('splash'); ring(p.x, p.y, 'good', k(1.3), 2); burst(p.x, p.y, 'paper', { n: 14, R: k(1.1), keep: false, big: 0.7 });
    puff(p.x, p.y - k(0.2), 'paper', { n: 4, op: 0.4, rise: k(0.9), ms: 1200 });
    motes(p.x, p.y, 'paper', { n: 8, R: k(0.7) });
    fade(v, 320);
    await wait(420);
    await seatStamp(ti, '驅魔', 'good', { mark: mark('exorcist') });
    await finish();
  });

  // 旅店老闆：一張床分成兩張飛到兩人面前，咚地落下，打起瞌睡
  const innkeeper = scene(async (e, me) => {
    cast(me, e.to);
    await wait(320);
    const bed = await emerge('bed', 'good', me, { size: k(1.05), snd: 'tock' });
    await wait(260);
    const c = posOf(bed), beds = e.to.map((_, i) => (i ? put(sticker('bed', 'good'), c.x, c.y, k(1.05)) : bed));
    await Promise.all(e.to.map(async (id, i) => {
      await wait(i * 120);
      const q = inward(id, 0.68);
      await fly(beds[i], q, 480, 'good', { lift: k(0.8), s1: 0.85, trail: { d: k(0.05) } });
      sfx('thud', 0.6); squash(beds[i], 0.6); squash(tokOf(id), 0.4); ring(q.x, q.y, 'good', k(1.1), 1.7, 420); flecks(q.x, q.y, { n: 6, R: k(0.6) });
      snooze(q);
    }));
    await wait(760);
    await stamps(e.to, '入住', 'good', 'innkeeper', { hold: 500 });
    await finish();
  });

  // 賭徒：骰子在手裏搖三下，滾到目標面前，押下一張角色牌。對不對天亮才知道
  const gambler = scene(async (e, me) => {
    const ti = e.to[0], q = inward(ti, 1.4);
    cast(me, [ti]);
    await wait(320);
    const d = await emerge('rolling-dices', 'brass', me, { size: k(1), snd: 'rattle' });
    for (let i = 0; i < 3; i++) {
      sfx('rattle');
      anim(d, [{ translate: '0 0', rotate: '0deg' }, { translate: `${k(0.09)}px ${-k(0.13)}px`, rotate: '12deg' }, { translate: `${-k(0.09)}px ${k(0.04)}px`, rotate: '-10deg' }, { translate: '0 0', rotate: '0deg' }], { duration: 220, fill: 'none' });
      await wait(250);
    }
    sfx('swish');
    await moveTo(d, { x: q.x - k(0.55), y: q.y }, 640, { lift: k(0.45), spin: 2, ease: 'cubic-bezier(.2,.7,.3,1)' });
    sfx('tock'); squash(d, 0.7); ring(q.x - k(0.55), q.y, 'brass', k(0.9), 1.7, 380);
    await wait(260);
    if (e.role) {
      const tkn = roleCard(e.role, q.x + k(0.4), q.y, k(0.95));
      beat(tkn, 'tag'); ring(q.x + k(0.4), q.y, teamCol(e.role), k(1.1), 1.9, 420); squash(tokOf(ti), 0.4);
      flecks(q.x + k(0.4), q.y, { n: 6, R: k(0.6), tones: ['brass', 'paper'] });
      await wait(520);
    }
    await seatStamp(ti, '押', 'brass', { mark: mark('gambler') });
    await finish();
  });

  // 侍臣：不指座位——角色牌在桌心顯影，金杯傾倒，酒澆下去，三枚月牌一枚枚落下
  const courtier = scene(async (e, me) => {
    const m = T.mid, c = { x: m.x, y: m.y + k(0.1) };
    cast(me, []);
    await wait(320);
    const cup = await emerge('jeweled-chalice', 'brass', me, { size: k(1.05), snd: 'shimmer' });
    await wait(200);
    const tkn = roleCard(e.role, c.x, c.y, k(1.35));
    develop(tkn, 420); sfx('hum');
    await wait(420);
    tkn.classList.remove('ab-dev');
    await fly(cup, { x: c.x - k(0.4), y: c.y - k(1.6) }, 480, 'brass', { rot: 16, lift: k(0.8) });
    tip(cup, 128);
    await wait(240);
    await pour({ x: c.x + k(0.08), y: c.y - k(1.05) }, c, 'poison', tkn);
    sfx('splat'); ring(c.x, c.y, 'poison', k(1.5), 2);
    fade(cup, 280);
    await wait(240);
    const moons = [-1, 0, 1].map(i => put(chip('moon', 'night'), c.x + i * k(0.72), c.y - k(1.08), k(0.56)));
    moons.forEach(x => { x.style.opacity = 0; });
    for (const x of moons) { beat(x, 'tag'); await wait(230); }
    await answer([tkn, ...moons], '醉三天', 'poison', { dy: 1.25, to: tkn, mote: 'poison' });
  });

  // 教授：燒瓶冒泡，飛到灰牌上澆藥，綠墨暈開。救沒救活天亮才知道
  const professor = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti]);
    await wait(320);
    const fl = await emerge('round-bottom-flask', 'good', me, { size: k(1.05), snd: 'hum' });
    for (let i = 0; i < 4; i++) later(i * 130, () => { const c = posOf(fl); burst(c.x + rand(-0.15, 0.15) * T.tk, c.y - k(0.3), 'good', { n: 3, R: k(0.3), keep: false, big: 0.5, dir: -Math.PI / 2, spread: 0.9 }); sfx('drip', 0.5); });
    await wait(560);
    await fly(fl, { x: p.x - k(0.32), y: p.y - k(1.5) }, 520, 'good', { rot: 18, lift: W() * 0.14 });
    tip(fl, 128);
    await wait(240);
    await pour({ x: p.x + k(0.1), y: p.y - k(1) }, p, 'good', tt);
    sfx('splash'); develop(blot(p.x, p.y, 'good', k(1.45), 0.5), 480);
    motes(p.x, p.y, 'brass', { n: 12, R: k(0.8), ms: 1500 }); fade(fl, 320);
    await wait(520);
    await seatStamp(ti, '試藥', 'good', { mark: mark('professor') });
    await finish();
  });

  // 教父：指間拈起玫瑰，轉一圈拋過去，花瓣散落
  const godfather = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti], EVIL_WASH);
    await wait(320);
    const r = await emerge('rose', 'evil', me, { size: k(1.05), snd: 'swish' });
    anim(r, [{ rotate: '0deg' }, { rotate: '-20deg' }, { rotate: '12deg' }, { rotate: '0deg' }], { duration: 460, fill: 'none' });
    await wait(480);
    await fly(r, { x: p.x, y: p.y - k(0.2) }, 560, 'evil', { lift: W() * 0.2, spin: 1, trail: { d: k(0.06) } });
    sfx('stab'); squash(tt, 1); ring(p.x, p.y, 'evil', k(1.3), 2);
    petals(p.x, p.y - k(0.25), 16);
    await wait(180);
    develop(blot(p.x, p.y + k(0.05), 'evil', k(1.2), 0.45), 340);
    fade(r, 300);
    await wait(420);
    await seatStamp(ti, '攻擊', 'evil', { mark: mark('godfather') });
    await finish();
  });

  // 魔鬼代言人：契約飄到目標面前，羽毛筆一筆簽下
  const devilsadvocate = scene(async (e, me) => {
    const ti = e.to[0], q = inward(ti, 0.95);
    cast(me, [ti]);
    await wait(320);
    const ct = await emerge('tied-scroll', 'evil', me, { size: k(1.05), snd: 'page' });
    await wait(200);
    await fly(ct, q, 500, 'paper', { lift: k(0.9), s1: 1.2 });
    sfx('tock'); squash(ct, 0.4);
    const qn = put(sticker('quill-ink', 'evil'), q.x + k(0.55), q.y - k(0.62), k(0.8));
    qn.style.opacity = 0;
    anim(qn, [{ transform: `translate(${k(0.4)}px, ${-k(0.5)}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    await wait(280);
    const line = 'M6 26c8-14 14-16 16-8s-6 14-2 12 10-16 16-12-4 14 2 12 10-12 14-8 2 10 8 8 10-8 30-6';
    const sg = put(svgEl('0 0 100 40', `<path d="${line}" style="fill:none;stroke:${C.paper};stroke-width:9;stroke-linecap:round"/><path d="${line}" style="fill:none;stroke:${C.evil};stroke-width:4.5;stroke-linecap:round"/>`), q.x, q.y + k(0.34), k(1.05), k(0.42));
    sg.querySelectorAll('path').forEach(x => { x.style.strokeDasharray = 240; anim(x, [{ strokeDashoffset: 240 }, { strokeDashoffset: 0 }], { duration: 620, easing: 'ease-in-out' }); });
    for (let i = 0; i < 4; i++) later(i * 150, () => sfx('leaf'));
    anim(qn, Array.from({ length: 9 }, (_, i) => ({ translate: `${-k(1) + i / 8 * k(1)}px ${k(0.9) + Math.sin(i * 1.9) * k(0.12)}px` })), { duration: 620, fill: 'none' });
    await wait(680);
    fade(qn, 240);
    await seatStamp(ti, '辯護', 'evil', { mark: mark('devilsadvocate') });
    await finish();
  });

  // 刺客：飛刀在指間轉一圈，直線擲出，劈開護圈釘在牌上（什麼保護都擋不住）
  const assassin = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti], EVIL_WASH);
    await wait(320);
    const dg = await emerge('thrown-daggers', 'evil', me, { size: k(1.05), snd: 'swish' });
    anim(dg, [{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 440, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'none' });
    await wait(480);
    const sh = dome(p);
    sfx('shimmer');
    await wait(240);
    sfx('whoosh', 0.8);
    await moveTo(dg, { x: p.x, y: p.y - k(0.1) }, 170, { lift: 0, ease: 'cubic-bezier(.7,0,1,.6)', s1: 0.8 });
    sfx('crack'); sfx('stab'); fade(sh, 90); ring(p.x, p.y, 'good', k(1.4), 2, 300);
    flecks(p.x, p.y, { n: 12, R: k(1.2), tones: ['good', 'paper'] }); burst(p.x, p.y, 'evil', { n: 18, R: k(1.2), streak: 0.7 }); squash(tt, 1.2);
    anim(dg, [0, 3, -3, 2, -1, 0].map(d => ({ rotate: d + 'deg' })), { duration: 380, fill: 'none' });
    await wait(480);
    await seatStamp(ti, '刺殺', 'evil', { mark: mark('assassin') });
    await finish();
  });

  // 僵怖：目標腳下的土裂開，一隻手從坑裏伸出來把牌往下拽
  const zombuul = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti], EVIL_WASH), g = { x: p.x, y: p.y + k(0.52) };
    await wait(320);
    ring(at(me).x, at(me).y, 'evil', k(1.2), 1.6, 420);
    sfx('rumble'); pit(g);
    await wait(420);
    const S = k(1.45), rs = h('div', { class: 'ab-rise' }, sticker('raise-zombie', 'evil')), hand = put(rs, g.x, g.y - S / 2 + k(0.04), S, S);
    anim(rs.firstChild, [{ transform: 'translateY(100%)' }, { transform: 'translateY(-6%)', offset: 0.75 }, { transform: 'none' }], { duration: 440, easing: 'cubic-bezier(.3,.8,.4,1)' });
    sfx('dig');
    await wait(440);
    sfx('thud'); squash(hand, 0.6);
    anim(tt, [{ transform: 'none' }, { transform: `translateY(${k(0.16)}px) scale(.96)` }], { duration: 220, easing: 'cubic-bezier(.6,0,1,.6)' });
    burst(p.x, p.y + k(0.2), 'evil', { n: 14, R: k(1) }); clods(g.x, g.y, { n: 6 });
    await wait(460);
    await seatStamp(ti, '攻擊', 'evil', { mark: mark('zombuul') });
    await finish();
  });

  // 普卡：毒牙往後一縮，直線撲咬，留下兩個牙印，綠墨暈開
  const pukka = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti], EVIL_WASH);
    await wait(320);
    const fang = await emerge('snake-bite', 'poison', me, { size: k(1.1), snd: 'hiss' }), a = posOf(fang), L = Math.hypot(p.x - a.x, p.y - a.y) || 1;
    await moveTo(fang, { x: a.x - (p.x - a.x) / L * k(0.32), y: a.y - (p.y - a.y) / L * k(0.32) }, 240, { lift: 0, s1: 1.12, ease: 'cubic-bezier(.3,0,.2,1)' });
    sfx('hiss'); wiggle(fang, 0.6);
    await wait(240);
    await moveTo(fang, { x: p.x, y: p.y - k(0.1) }, 150, { lift: 0, s1: 1, ease: 'cubic-bezier(.7,0,1,.6)' });
    sfx('stab'); sfx('splat'); squash(tt, 1); ring(p.x, p.y, 'poison', k(1.3), 2);
    [-1, 1].forEach(s => dot(p.x + s * k(0.16), p.y - k(0.12), k(0.13), 'ink'));
    fade(fang, 260);
    develop(blot(p.x, p.y, 'poison', k(1.5), 0.72), 520);
    burst(p.x, p.y, 'poison', { n: 16, R: k(1.15) }); puff(p.x, p.y - k(0.3), 'poison', { n: 3, op: 0.35, rise: k(0.9), ms: 1200, delay: 200 });
    await wait(560);
    await seatStamp(ti, '中毒', 'poison', { mark: mark('pukka') });
    await finish();
  });

  // 沙巴洛斯：巨口從桌心冒出來，左一口右一口，紙屑飛濺
  const shabaloth = scene(async (e, me) => {
    const m = T.mid;
    cast(me, e.to, EVIL_WASH);
    await wait(320);
    sfx('rumble'); pit(m, 1.6);
    await wait(320);
    const jaws = put(sticker('shark-jaws', 'evil'), m.x, m.y, k(1.7));
    anim(jaws, [{ transform: `translateY(${k(0.4)}px) scale(.3)`, opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'ease-out' });
    sfx('demon'); clods(m.x, m.y, { n: 8 });
    await wait(480);
    stop(jaws);
    for (const id of e.to) {
      const p = at(id);
      await fly(jaws, { x: p.x, y: p.y - k(0.05) }, 300, 'evil', { lift: k(0.25), s1: 0.74, trail: { d: k(0.07), gap: k(0.14) } });
      anim(jaws, [{ scale: '1 1' }, { scale: '1.18 .5' }, { scale: '1 1' }], { duration: 180, fill: 'none' });
      sfx('stab'); sfx('crack'); squash(tokOf(id), 1.2); ring(p.x, p.y, 'evil', k(1.3), 2);
      flecks(p.x, p.y, { n: 12, R: k(1.1), tones: ['paper', 'evil'] }); burst(p.x, p.y, 'evil', { n: 12, R: k(1) });
      await wait(260);
    }
    await moveTo(jaws, m, 300, { lift: k(0.2), s1: 0.5 });
    fade(jaws, 200);
    await wait(120);
    await stamps(e.to, '攻擊', 'evil', 'shabaloth', { hold: 560 });
    await finish();
  });

  // 珀：火苗跳起，火舌撲向目標（蓄力過是三道，燒得更大）；不選人：火苗縮回牌裏，下次燒三個
  const po = scene(async (e, me) => {
    const to = e.to || [], m = at(me), three = to.length > 1;
    cast(me, to, EVIL_WASH);
    await wait(280);
    sfx('fire'); flames(m.x, m.y, { n: three ? 11 : 6 });
    const fire = await emerge('small-fire', 'evil', me, { size: k(three ? 1.4 : 1.05), snd: 'demon' });
    await wait(300);
    if (!to.length) {
      await moveTo(fire, m, 380, { lift: k(0.3), s1: 0.2 });
      fade(fire, 160); sfx('fire'); ring(m.x, m.y, 'evil', k(1.35), 1.25, 520); squash(tokOf(me), 0.6);
      return answer([], '蓄力', 'evil', { dy: 0 });
    }
    const b = posOf(fire);
    await Promise.all(to.map(async (id, i) => {
      const p = at(id), f = put(sticker('small-fire', 'evil'), b.x, b.y, k(0.8));
      await fly(f, { x: p.x, y: p.y - k(0.15) }, three ? 380 : 440, 'evil', { lift: k(0.4 + i * 0.25), trail: { d: k(0.09), gap: k(0.12) } });
      sfx('fire'); flames(p.x, p.y, { n: 6, R: k(0.5) }); squash(tokOf(id), 1); burst(p.x, p.y, 'evil', { n: 12, R: k(0.9) }); ring(p.x, p.y, 'evil', k(1.3), 2);
      fade(f, 200);
    }));
    fade(fire, 240);
    await wait(420);
    await stamps(to, '攻擊', 'evil', 'po', { hold: 560 });
    await finish();
  });

  // ———— 黯月初升：收到信息 ————
  // 祖母：毛線團滾過桌面停在孫子腳邊，冒出小愛心；他的牌從線團裏立起來，到桌心停一會，再落回他身邊
  const grandmother = scene(async (e, me) => {
    const id = others([e.id], me)[0], p = at(id || me), m = T.mid;
    cast(me, id ? [id] : []);
    await wait(320);
    const ball = await emerge('yarn', 'good', me, { size: k(0.85), snd: 'tock' });
    await wait(160);
    trail(ball, 'good', { d: k(0.05), gap: k(0.22) });
    sfx('swish');
    await moveTo(ball, inward(id || me, 0.72), 840, { lift: k(0.1), spin: 3, ease: 'cubic-bezier(.35,0,.3,1)' });
    ball._trail = false;
    sfx('tock'); squash(ball, 0.6); squash(tokOf(id || me), 0.5); ring(p.x, p.y, 'good', k(1.2), 1.7, 440);
    for (let i = 0; i < 4; i++) later(i * 120, () => floatUp('hearts', 'good', p.x + rand(-0.4, 0.4) * T.tk, p.y - k(0.3), k(0.3)));
    await wait(560);
    const b = posOf(ball), tkn = roleCard(e.role, b.x, b.y, k(0.8));
    develop(tkn, 340); sfx('hum');
    await wait(340);
    tkn.classList.remove('ab-dev');
    await moveTo(tkn, m, 480, { lift: k(0.7), s1: 1.75 });
    sfx('stamp'); ring(m.x, m.y, teamCol(e.role), k(1.4), 2.1); squash(tkn, 0.4);
    fade(ball, 300);
    await wait(120);
    const st = await spotStamp({ x: m.x, y: m.y + k(1.2) }, '孫子', 'good', { fs: big() });
    await hold([tkn, st.parentElement], 'paper');
    fade(st.parentElement, 240);
    await toSeat(tkn, id, 0, rOf(e.role));
    await finish();
  });

  // 侍女選完人：提燈亮起，挨個照進兩個座位
  const glow = id => { const p = at(id); ring(p.x, p.y, 'paper', k(1.15), 1.6, 460); motes(p.x, p.y, 'brass', { n: 6, R: k(0.5) }); squash(tokOf(id), 0.3); sfx('tick'); };
  const cmPick = scene(async (e, me) => {
    cast(me, e.to, SELF_WASH, 320);
    await wait(260);
    const lamp = await emerge('old-lantern', 'brass', me, { size: k(0.95), snd: 'clip' });
    for (const id of e.to) {
      await fly(lamp, inward(id, 0.75), 400, 'brass', { lift: k(0.5), trail: { d: k(0.05) } });
      glow(id);
      await wait(320);
    }
    await finish(360);
  });
  // 侍女：提燈回到桌心，亮起兩隻眼睛，有幾個人醒著就睜開幾隻（不對應座位）
  const chambermaid = scene(async (e, me) => {
    const seats = others(e.ids, me), n = e.n | 0, m = T.mid;
    cast(me, seats);
    await wait(320);
    const lamp = await emerge('old-lantern', 'brass', me, { size: k(0.95), snd: 'clip' });
    for (const id of seats) {
      await fly(lamp, inward(id, 0.75), 340, 'brass', { lift: k(0.45), trail: { d: k(0.05) } });
      glow(id);
      await wait(240);
    }
    await fly(lamp, { x: m.x, y: m.y - k(0.85) }, 400, 'brass', { lift: k(0.5), s1: 1.3 });
    sfx('tock');
    const eyes = [0, 1].map(i => put(chip(i < n ? 'eye' : 'hidden', i < n ? 'brass' : 'gray'), m.x + (i ? 1 : -1) * k(0.52), m.y + k(0.1), k(0.72)));
    eyes.forEach(x => { x.style.opacity = 0; });
    for (const x of eyes) { beat(x, 'tag'); await wait(260); }
    await answer([lamp, ...eyes], `${n} 人醒`, 'brass');
  });

  // 教父首夜：外來者的牌一張張砸在桌心（在場有誰，不指座位）；沒有的話一陣花瓣
  const gfInfo = scene(async (e, me) => {
    const roles = e.roles || [], m = T.mid, n = roles.length;
    cast(me, []);
    await wait(320);
    const r = await emerge('rose', 'evil', me, { size: k(0.95), snd: 'swish' });
    await wait(260);
    if (!n) { petals(m.x, m.y - k(0.4), 14, 'gray', 1.2); sfx('miss'); fade(r, 300); await wait(360); return answer([], '沒有', 'gray', { dy: 0, soft: true }); }
    const gap = Math.min(k(1.3), k(4) / n), toks = roles.map((id, i) => roleCard(id, m.x + (i - (n - 1) / 2) * gap, m.y - k(0.15), k(1.15)));
    toks.forEach(x => { x.style.opacity = 0; });
    for (const x of toks) { beat(x, 'stamp'); const c = cen(x); petals(c.x, c.y, 5, 'evil', 0.6); await wait(320); }
    fade(r, 260);
    const st = await spotStamp({ x: m.x, y: m.y + k(1) }, '外來者', 'evil', { fs: big() });
    await hold([...toks, st.parentElement], 'evil');
    fade(st.parentElement, 240);
    await toHud(toks);
    await finish();
  });

  // 被驅魔的惡魔：一滴聖水從桌心落到自己牌上，白霧騰起；驅魔人的牌落到那個人身邊
  const exorcised = scene(async (e, me) => {
    const m = at(me), mid = T.mid, from = others([e.from], me)[0];
    wash(EVIL_WASH); const own = lift(me);
    await wait(320);
    const v = put(sticker('holy-water', 'good'), mid.x, mid.y, k(1.05));
    beat(v, 'shimmer');
    await wait(300);
    await fly(v, { x: m.x - k(0.3), y: m.y - k(1.5) }, 460, 'good', { rot: 18, lift: k(0.6) });
    tip(v, 128);
    await wait(240);
    await pour({ x: m.x + k(0.1), y: m.y - k(1) }, m, 'good', own, 4);
    sfx('splash'); puff(m.x, m.y - k(0.2), 'paper', { n: 4, op: 0.4, rise: k(0.9), ms: 1200 });
    fade(v, 300);
    const st = await spotStamp({ x: mid.x, y: mid.y + k(0.9) }, '今晚不醒', 'good', { fs: big() });
    const tkn = roleCard('exorcist', mid.x, mid.y - k(0.2), k(1.35));
    develop(tkn, 420);
    await wait(420);
    await hold([tkn, st.parentElement], 'paper');
    fade(st.parentElement, 240);
    await toSeat(tkn, from, 0, rOf('exorcist'));
    await finish();
  });

  // ———— 夢殞春宵：選人 ————
  // 舞蛇人：排笛吹起，音符飄起，蛇從自己牌裏游到目標面前立起來嗅一嗅，蓋「查驗」。
  // 選中惡魔（e.swap）接著演：蛇撲上去，兩張牌繞著彼此游到對方座位，自己的牌翻成惡魔；然後蛇咬一口，對方中毒
  const snakecharmer = scene(async (e, me) => {
    const ti = e.to[0], m = at(me), [tt] = cast(me, [ti]), own = tokOf(me);
    await wait(320);
    const fl = await emerge('pan-flute', 'brass', me, { size: k(1), snd: 'hum' }), q = posOf(fl);
    for (let i = 0; i < 6; i++) later(i * 170, () => floatUp('musical-notes', 'brass', q.x + rand(-0.4, 0.4) * T.tk, q.y - k(0.4), k(0.34), 900));
    await wait(520);
    const sn = put(sticker('snake', 'good'), m.x, m.y, k(0.95));
    sn.style.opacity = 0;
    anim(sn, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'ease-out' });
    await wait(240);
    stop(sn); sn.style.opacity = 1;
    sfx('swish');
    await slither(sn, inward(ti, 0.8), 780);
    sfx('hiss'); wiggle(sn, 0.8); squash(tt, 0.4); ring(at(ti).x, at(ti).y, 'good', k(1.2), 1.7, 440);
    await wait(460);
    await seatStamp(ti, '查驗', 'good', { mark: mark('snakecharmer') });
    if (e.swap) {
      const p = at(ti);
      wash(EVIL_WASH, 360); fade(fl, 300);
      sfx('hiss'); wiggle(sn, 1); squash(tt, 0.7); ring(p.x, p.y, 'evil', k(1.3), 1.9); burst(p.x, p.y, 'evil', { n: 10, R: k(0.8), keep: false });
      await wait(420);
      const mine = roleCard(e.swap.gave, m.x, m.y, T.tk), theirs = roleCard(e.swap.role, p.x, p.y, T.tk);
      theirs.style.opacity = 0;
      anim(theirs, [{ transform: 'scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out' });
      await wait(320);
      stop(theirs); theirs.style.opacity = 1;
      sfx('swish');
      await Promise.all([slither(mine, p, 820), slither(theirs, m, 820)]);
      const land = toSeat(mine, ti, 0, rOf(e.swap.gave));
      later(130, () => fade(theirs, 200));
      squash(own, 0.8); await flipTo(own, e.swap.role);
      ring(m.x, m.y, 'evil', k(1.4), 2.1); burst(m.x, m.y, 'evil', { n: 10, R: k(0.9), keep: false });
      await wait(360);
      await seatStamp(me, '交換', 'evil', { hold: 420 });
      await land;
      await moveTo(sn, { x: p.x, y: p.y - k(0.1) }, 150, { lift: 0, ease: 'cubic-bezier(.7,0,1,.5)' });
      sfx('hiss'); sfx('thud', 0.5); squash(tt, 0.9); develop(blot(p.x, p.y, 'poison', k(1.3), 0.55), 400); fade(sn, 240);
      await wait(320);
      await seatStamp(ti, '中毒', 'poison', { hold: 420 });
    }
    await finish();
  });

  // 女巫：布娃娃落在目標面前，一根針扎進去，目標頭上浮起咒印
  const witch = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), q = inward(ti, 0.92), [tt] = cast(me, [ti], EVIL_WASH);
    await wait(320);
    const doll = await emerge('voodoo-doll', 'evil', me, { size: k(1), snd: 'tock' });
    await wait(220);
    await fly(doll, q, 500, 'evil', { lift: k(0.9), s1: 1.15 });
    sfx('thud', 0.6); squash(doll, 0.6); ring(q.x, q.y, 'evil', k(1.1), 1.7, 420);
    await wait(200);
    const nd = put(sticker('sewing-needle', 'brass'), q.x + k(0.1), q.y - k(1.25), k(0.85));
    nd.style.opacity = 0;
    anim(nd, [{ transform: `translateY(${-k(0.5)}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'ease-out' });
    await wait(260);
    stop(nd); nd.style.opacity = 1;
    await moveTo(nd, { x: q.x + k(0.1), y: q.y - k(0.42) }, 110, { lift: 0, ease: 'cubic-bezier(.8,0,1,.4)' });
    sfx('stab'); squash(doll, 1); squash(tt, 0.8); burst(q.x, q.y - k(0.1), 'evil', { n: 12, R: k(0.8), big: 0.7 }); ring(p.x, p.y, 'evil', k(1.2), 1.9);
    await wait(320);
    const sig = put(sticker('pentacle', 'evil'), p.x, p.y - k(1.02), k(0.8));
    beat(sig, 'hiss'); motes(p.x, p.y - k(1), 'evil', { n: 7, R: k(0.4) });
    anim(sig, [{ rotate: '0deg' }, { rotate: '24deg' }], { duration: 1400, fill: 'none' });
    await wait(420);
    await seatStamp(ti, '詛咒', 'evil', { mark: mark('witch') });
    await finish();
  });

  // 洗腦師：墨色漩渦在目標頭上轉開，一張善良角色牌旋著釘進去
  const cerenovus = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), mid = T.mid, c = above(ti, 1.15), [tt] = cast(me, [ti], EVIL_WASH);
    await wait(320);
    const sp = await emerge('oily-spiral', 'evil', me, { size: k(1), snd: 'hum' });
    await wait(200);
    await fly(sp, c, 520, 'evil', { lift: k(0.8), s1: 1.25, trail: { d: k(0.06) } });
    const spin = anim(sp.firstChild, [{ rotate: '0deg' }, { rotate: '-360deg' }], { duration: 900, iterations: Infinity, fill: 'none', easing: 'linear' });
    ring(c.x, c.y, 'evil', k(1.2), 1.9); sfx('hiss');
    await wait(300);
    if (e.role) {
      const tkn = roleCard(e.role, mid.x, mid.y, k(1.1));
      develop(tkn, 320); sfx('tag');
      await wait(420);
      tkn.classList.remove('ab-dev');
      await moveTo(tkn, c, 560, { lift: k(0.5), spin: 2, s1: 0.3, ease: 'cubic-bezier(.5,0,.8,.6)' });
      fade(tkn, 90); sfx('stab'); squash(tt, 0.8); burst(c.x, c.y, 'evil', { n: 14, R: k(0.8), big: 0.7 });
    }
    wiggle(tokOf(ti), 1); motes(p.x, p.y, 'evil', { n: 8, R: k(0.6) });
    await wait(420);
    spin?.cancel(); fade(sp, 240);
    await seatStamp(ti, '瘋狂', 'evil', { mark: mark('cerenovus') });
    await finish();
  });

  // 麻臉巫婆：坩堝在桌心咕嘟冒泡，角色牌丟進鍋，一勺綠湯潑到目標身上
  const pithag = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), m = T.mid, c = { x: m.x, y: m.y + k(0.25) }, [tt] = cast(me, [ti], EVIL_WASH);
    await wait(320);
    const pot = await emerge('cauldron', 'poison', me, { size: k(1), snd: 'tock' });
    await wait(160);
    await fly(pot, c, 480, 'poison', { lift: k(0.8), s1: 1.5 });
    sfx('thud', 0.7); squash(pot, 0.5); impress('cauldron', 'poison', pot);
    const boil = setInterval(() => { puff(c.x + rand(-0.4, 0.4) * T.tk, c.y - k(0.5), 'poison', { n: 1, d: k(0.3), op: 0.4, rise: k(0.5), ms: 700 }); burst(c.x + rand(-0.3, 0.3) * T.tk, c.y - k(0.45), 'poison', { n: 3, R: k(0.3), keep: false, big: 0.5, dir: -Math.PI / 2, spread: 1 }); }, 200);
    sfx('splat', 0.6);
    await wait(360);
    if (e.role) {
      const tkn = roleCard(e.role, at(me).x, at(me).y, k(0.95));
      sfx('whoosh', 0.6);
      await moveTo(tkn, { x: c.x, y: c.y - k(0.62) }, 500, { lift: k(1.1), spin: 1, s1: 0.5 });
      fade(tkn, 100); sfx('splash'); burst(c.x, c.y - k(0.6), 'poison', { n: 16, R: k(1), big: 0.8, dir: -Math.PI / 2, spread: Math.PI * 0.9, keep: false });
      await wait(320);
    }
    clearInterval(boil);
    const ld = put(sticker('ladle', 'brass'), c.x + k(0.4), c.y - k(0.75), k(0.95));
    beat(ld, 'clip');
    await wait(240);
    await fly(ld, { x: p.x - k(0.1), y: p.y - k(1.25) }, 480, 'poison', { lift: k(0.7), rot: 150, trail: { d: k(0.06) } });
    await pour({ x: p.x, y: p.y - k(0.9) }, p, 'poison', tt, 5);
    sfx('splat'); develop(blot(p.x, p.y, 'poison', k(1.4), 0.6), 460); fade(ld, 260);
    await wait(460);
    await seatStamp(ti, '變身', 'evil', { mark: mark('pithag') });
    await finish();
  });

  // 哲學家：書在桌心翻開，選中的角色牌落在書頁上，墨霧流進自己的牌，自己的牌翻成那個角色
  const philosopher = scene(async (e, me) => {
    const m = T.mid, c = { x: m.x, y: m.y + k(0.1) }, a = at(me);
    wash(SELF_WASH); const own = lift(me);
    await wait(320);
    const bk = await emerge('open-book', 'brass', me, { size: k(1), snd: 'page' });
    await wait(180);
    await fly(bk, c, 460, 'brass', { lift: k(0.8), s1: 1.6 });
    sfx('page'); squash(bk, 0.5);
    await wait(180);
    const tkn = roleCard(e.role, c.x, c.y - k(1.6), k(1.1));
    tkn.style.opacity = 0;
    anim(tkn, [{ transform: 'rotate(-14deg)', opacity: 0 }, { transform: 'rotate(-14deg)', opacity: 1, offset: 0.25 }, { transform: `translateY(${k(1.15)}px) rotate(0)`, opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.4,0,.5,1)' });
    await wait(520);
    sfx('stamp'); ring(c.x, c.y - k(0.45), teamCol(e.role), k(1.3), 2);
    await wait(240);
    wisp({ x: c.x, y: c.y - k(0.45) }, a, 'ink', { n: 9, d: k(0.42), op: 0.7, ms: 720 }); sfx('swish');
    fade(tkn, 720);
    await wait(760);
    squash(own, 0.8); await flipTo(own, e.role);
    ring(a.x, a.y, 'brass', k(1.4), 2.1); burst(a.x, a.y, 'brass', { n: 10, R: k(0.9), keep: false });
    await wait(360);
    await spotStamp({ x: c.x, y: c.y + k(0.9) }, '獲得', 'brass', { fs: big() });
    await wait(620);
    await finish();
  });

  // 理髮師（惡魔替他選）：剃刀在兩個座位上各劃一刀，兩張牌的影子交叉換位
  const barber = scene(async (e, me) => {
    const [a, b] = e.to, tts = cast(me, e.to, EVIL_WASH);
    await wait(320);
    const rz = await emerge('razor', 'evil', me, { size: k(1), snd: 'swish' });
    await wait(200);
    for (const id of e.to) {
      await fly(rz, above(id, 0.5), 340, 'evil', { lift: k(0.5), trail: { d: k(0.05) } });
      await moveTo(rz, { x: at(id).x, y: at(id).y }, 120, { lift: 0, ease: 'cubic-bezier(.7,0,1,.5)' });
      sfx('slash'); slashAt(at(id)); squash(tokOf(id), 0.8); burst(at(id).x, at(id).y, 'evil', { n: 8, R: k(0.8), keep: false });
      await wait(240);
    }
    fade(rz, 240);
    const pa = at(a), pb = at(b), ga = put(tts[0].firstChild.cloneNode(true), pa.x, pa.y, T.tk), gb = put(tts[1].firstChild.cloneNode(true), pb.x, pb.y, T.tk);
    [ga, gb].forEach(x => { x.style.opacity = 0.75; });
    sfx('whoosh', 0.7);
    await Promise.all([moveTo(ga, pb, 560, { lift: k(0.9) }), moveTo(gb, pa, 560, { lift: -k(0.9) })]);
    fade(ga, 200); fade(gb, 200); ring(pa.x, pa.y, 'evil', k(1.2), 1.8, 420); ring(pb.x, pb.y, 'evil', k(1.2), 1.8, 420);
    await wait(240);
    await stamps(e.to, '交換', 'evil', 'barber', { hold: 520 });
    await finish();
  });

  // 方古：獠牙咧開，低低地撲過去，一口咬合
  const fanggu = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti], EVIL_WASH);
    await wait(320);
    const fg = await emerge('bestial-fangs', 'evil', me, { size: k(1.15), snd: 'demon' });
    anim(fg, [{ scale: '1 1' }, { scale: '1.14 .82' }, { scale: '1 1' }], { duration: 300, fill: 'none' });
    await wait(340);
    await fly(fg, { x: p.x, y: p.y - k(0.08) }, 380, 'evil', { lift: W() * 0.1, ease: 'cubic-bezier(.4,0,.8,.7)', trail: { d: k(0.08), gap: k(0.13) } });
    anim(fg, [{ scale: '1 1' }, { scale: '1.22 .55' }, { scale: '1 .9' }], { duration: 170 });
    sfx('stab'); sfx('thud'); squash(tt, 1.3); ring(p.x, p.y, 'evil', k(1.3), 2.2); later(100, () => ring(p.x, p.y, 'evil', k(1.1), 1.7, 440));
    burst(p.x, p.y - k(0.1), 'evil', { n: 22, R: k(1.4), big: 1.1, streak: 0.6 }); develop(blot(p.x, p.y + k(0.05), 'evil', k(1.25), 0.5), 360);
    await wait(440);
    fade(fg, 260);
    await seatStamp(ti, '攻擊', 'evil', { mark: mark('fanggu') });
    await finish();
  });

  // 亡骨魔：骨手從桌外伸進來，一把攥住牌，骨頭咯咯響
  const vigormortis = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), mid = T.mid, [tt] = cast(me, [ti], EVIL_WASH), L = Math.hypot(p.x - mid.x, p.y - mid.y) || 1;
    await wait(320);
    const out = { x: p.x + (p.x - mid.x) / L * k(1.9), y: p.y + (p.y - mid.y) / L * k(1.9) };
    const hand = put(sticker('skeletal-hand', 'paper'), out.x, out.y, k(1.4));
    hand.style.opacity = 0;
    anim(hand, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    sfx('rattle');
    await wait(200);
    stop(hand); hand.style.opacity = 1;
    await moveTo(hand, { x: p.x, y: p.y - k(0.02) }, 300, { lift: 0, ease: 'cubic-bezier(.5,0,.7,.7)', s1: 0.95 });
    sfx('crack'); sfx('thud'); squash(tt, 1.1); ring(p.x, p.y, 'paper', k(1.3), 2);
    anim(hand, [{ scale: '1' }, { scale: '.8' }, { scale: '.86' }], { duration: 200 });
    for (let i = 0; i < 3; i++) later(160 + i * 130, () => { sfx('rattle', 0.5); burst(p.x, p.y, 'paper', { n: 4, R: k(0.7), keep: false, big: 0.7 }); });
    await wait(620);
    fade(hand, 240);
    await seatStamp(ti, '攻擊', 'evil', { mark: mark('vigormortis') });
    await finish();
  });

  // 諾-達鯴：四條觸手從牌邊捲起來，扭著纏住，一收
  const nodashii = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti], EVIL_WASH);
    await wait(320);
    sfx('hiss');
    const arms = [-1.1, -0.4, 0.4, 1.1].map((s, i) => {
      const a = put(sticker('curled-tentacle', 'evil'), p.x + s * k(0.62), p.y + k(0.1) - Math.abs(s) * k(0.12), k(1.05));
      if (s > 0) flipX(a);
      a.style.opacity = 0; a.style.transformOrigin = '50% 100%';
      anim(a, [{ transform: 'scale(.3, 0)', opacity: 0 }, { transform: `scale(1, 1.1) rotate(${s * 12}deg)`, opacity: 1, offset: 0.7 }, { transform: `rotate(${s * 8}deg)`, opacity: 1 }], { duration: 360, delay: i * 90, easing: 'cubic-bezier(.3,.9,.4,1)' });
      return [a, s];
    });
    await wait(720);
    sfx('splat', 0.7);
    arms.forEach(([a, s], i) => anim(a, [{ rotate: '0deg' }, { rotate: `${s * 7}deg` }, { rotate: `${-s * 5}deg` }, { rotate: '0deg' }], { duration: 460, delay: i * 40, fill: 'none' }));
    await wait(460);
    arms.forEach(([a, s]) => anim(a, [{ transform: `rotate(${s * 8}deg)`, translate: '0 0' }, { transform: `rotate(${-s * 14}deg)`, translate: `${-s * k(0.36)}px 0` }], { duration: 200, easing: 'cubic-bezier(.6,0,1,.6)' }));
    await wait(200);
    sfx('thud'); sfx('stab'); squash(tt, 1.3); ring(p.x, p.y, 'evil', k(1.3), 2); burst(p.x, p.y, 'evil', { n: 18, R: k(1.2) });
    await wait(480);
    await seatStamp(ti, '攻擊', 'evil', { mark: mark('nodashii') });
    await finish();
  });

  // 渦流：目標腳下的漩渦張開，牌轉著往下沉，到底一頓
  const vortox = scene(async (e, me) => {
    const ti = e.to[0], p = at(ti), [tt] = cast(me, [ti], EVIL_WASH), g = { x: p.x, y: p.y + k(0.1) };
    await wait(320);
    const v = put(sticker('whirlwind', 'evil'), g.x, g.y, k(1.75), undefined, 'under');
    v.style.opacity = 0;
    anim(v, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.3,.9,.4,1)' });
    const spin = anim(v.firstChild, [{ scale: '1 1' }, { scale: '-1 1' }, { scale: '1 1' }], { duration: 520, iterations: Infinity, fill: 'none', easing: 'linear' });
    sfx('rumble'); sfx('swish');
    await wait(420);
    anim(tt, [{ transform: 'none' }, { transform: 'rotate(540deg) scale(.42)' }], { duration: 780, easing: 'cubic-bezier(.6,0,.9,.6)' });
    for (let i = 0; i < 3; i++) later(i * 200, () => ring(g.x, g.y, 'evil', k(1.5 - i * 0.2), 0.45, 420));
    await wait(780);
    sfx('thud'); sfx('stab'); burst(p.x, p.y, 'evil', { n: 18, R: k(1.2) });
    anim(tt, [{ transform: 'rotate(540deg) scale(.42)' }, { transform: 'rotate(720deg) scale(1.06)', offset: 0.7 }, { transform: 'rotate(720deg)' }], { duration: 300, easing: 'ease-out' });
    await wait(340);
    spin?.cancel(); fade(v, 300);
    await seatStamp(ti, '攻擊', 'evil', { mark: mark('vortox') });
    await finish();
  });

  // ———— 夢殞春宵：選完人的輕演出 ————
  // 築夢師：捕夢網飄到目標頭頂，晃一晃
  const drPick = scene(async (e, me) => {
    const ti = e.to[0];
    cast(me, [ti], SELF_WASH, 320);
    await wait(260);
    const net = await emerge('dream-catcher', 'night', me, { size: k(1), snd: 'hum' });
    await fly(net, above(ti, 1.15), 560, 'paper', { lift: k(0.9), trail: { d: k(0.05) } });
    wiggle(net, 0.7); ring(at(ti).x, at(ti).y, 'paper', k(1.15), 1.6, 460); squash(tokOf(ti), 0.4);
    motes(at(ti).x, at(ti).y - k(0.8), 'paper', { n: 6, R: k(0.4) });
    await wait(560);
    await finish(360);
  });
  // 女裁縫：針穿過兩個座位，各點一下
  const ssPick = scene(async (e, me) => {
    cast(me, e.to, SELF_WASH, 320);
    await wait(260);
    const nd = await emerge('sewing-needle', 'brass', me, { size: k(0.95), snd: 'clip' });
    for (const id of e.to) {
      await fly(nd, inward(id, 0.65), 380, 'paper', { lift: k(0.5), trail: { d: k(0.05) } });
      sfx('tick'); squash(tokOf(id), 0.4); ring(at(id).x, at(id).y, 'paper', k(1.1), 1.6, 420);
      await wait(240);
    }
    await finish(360);
  });

  // ———— 夢殞春宵：收到信息 ————
  // 鐘錶匠：懷錶飛到桌心彈開，指針飛轉，慢下來，滴答幾聲停住
  const clockmaker = scene(async (e, me) => {
    const n = e.n | 0, m = T.mid, c = { x: m.x, y: m.y - k(0.25) }, S = k(1.5);
    cast(me, []);
    await wait(320);
    const w = await emerge('pocket-watch', 'brass', me, { size: k(1), snd: 'tock' });
    await wait(160);
    await fly(w, c, 460, 'brass', { lift: k(0.8), s1: 1.65 });
    sfx('unlock'); ring(c.x, c.y, 'brass', k(1.5), 1.7, 460);
    const ticks = Array.from({ length: 12 }, (_, i) => `<path d="M50 ${i % 3 ? 11 : 9}V${i % 3 ? 15 : 19}" transform="rotate(${i * 30} 50 50)" style="stroke:${C.ink};stroke-width:${i % 3 ? 1.6 : 3};stroke-linecap:round"/>`).join('');
    const dial = put(svgEl('0 0 100 100', `<circle cx="50" cy="50" r="46" style="fill:${C.paper};stroke:${C.ink};stroke-width:3"/>${ticks}<g class="hd"><path d="M50 56V15" style="stroke:${C.evil};stroke-width:3.5;stroke-linecap:round"/></g><circle cx="50" cy="50" r="4.5" style="fill:${C.ink}"/>`), c.x, c.y + S * 0.13, S * 0.7);
    dial.style.opacity = 0;
    anim(dial, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
    const hd = dial.querySelector('.hd');
    hd.style.transformOrigin = '50px 50px';
    anim(hd, [{ transform: 'rotate(0)' }, { transform: `rotate(${1080 + n * 30}deg)` }], { duration: 1300, easing: 'cubic-bezier(.15,.6,.25,1)' });
    [120, 300, 520, 780, 1080, 1320].forEach(t => later(t, () => sfx('tick')));
    await wait(1380);
    sfx('tock'); squash(w, 0.25); ring(c.x, c.y + S * 0.13, 'brass', k(1.1), 1.7, 420);
    await answer([w, dial], `${n} 步`, 'brass', { dy: 1.25 });
  });

  // 數學家：算盤砸在桌心，算珠一顆顆撥過去，有幾個人失常撥幾顆
  const mathematician = scene(async (e, me) => {
    const n = e.n | 0, m = T.mid, c = { x: m.x, y: m.y - k(0.2) };
    cast(me, []);
    await wait(320);
    const ab = await emerge('abacus', 'brass', me, { size: k(1), snd: 'tock' });
    await wait(160);
    await fly(ab, c, 460, 'brass', { lift: k(0.8), s1: 1.6 });
    sfx('thud'); squash(ab, 0.5); impress('abacus', 'brass', ab); ring(c.x, c.y, 'brass', k(1.5), 1.7, 440);
    await wait(280);
    const N = Math.max(5, n), gap = k(2.1) / N, y = c.y + k(1.02), beads = Array.from({ length: N }, (_, i) => put(h('i', { class: 'ab-bead' }), c.x - k(1.05) + (i + 0.5) * gap, y, k(0.2)));
    beads.forEach((b, i) => { b.style.opacity = 0; anim(b, [{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration: 160, delay: i * 30 }); });
    await wait(N * 30 + 180);
    for (let i = 0; i < n; i++) {
      anim(beads[i], [{ translate: '0 0' }, { translate: `0 ${-k(0.3)}px` }], { duration: 120, easing: 'cubic-bezier(.3,.9,.4,1)' });
      sfx('tick'); ring(cen(beads[i]).x, y - k(0.3), 'brass', k(0.3), 1.8, 300);
      await wait(190);
    }
    await wait(180);
    await answer([ab, ...beads], `${n} 人`, n ? 'evil' : 'good', { dy: 1.62 });
  });

  // 賣花女孩：花苞在桌心立起；惡魔投過票就綻成紅花，沒有就合攏垂下
  const flowergirl = scene(async (e, me) => {
    const yes = !!e.yes, m = T.mid, c = { x: m.x, y: m.y + k(0.45) };
    cast(me, []);
    await wait(320);
    const pot = await emerge('flower-pot', 'good', me, { size: k(1), snd: 'tock' });
    await wait(160);
    await fly(pot, c, 460, 'good', { lift: k(0.8), s1: 1.2 });
    sfx('thud', 0.5); squash(pot, 0.4);
    const r = put(sticker('rose', 'good'), c.x, c.y - k(1.05), k(1.2));
    r.style.opacity = 0; r.style.transformOrigin = '50% 100%';
    anim(r, [{ transform: 'scale(.15, .1)', opacity: 0 }, { transform: 'scale(.42, .8)', opacity: 1, offset: 0.7 }, { transform: 'scale(.45, .85)', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.3,.9,.4,1)' });
    sfx('leaf');
    await wait(820);
    if (yes) {
      r.querySelector('.f').style.color = C.evil; r.firstChild.style.setProperty('--c', C.evil);
      anim(r, [{ transform: 'scale(.45, .85)', opacity: 1 }, { transform: 'scale(1.14)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.3,.9,.4,1)' });
      sfx('stamp'); ring(c.x, c.y - k(1), 'evil', k(1.4), 2.1); petals(c.x, c.y - k(1), 14);
      await wait(360);
    } else {
      anim(r, [{ transform: 'scale(.45, .85)', opacity: 1 }, { transform: 'scale(.42, .8) rotate(74deg)', opacity: 1 }], { duration: 680, easing: 'cubic-bezier(.4,0,.5,1)' });
      sfx('miss'); puff(c.x + k(0.4), c.y - k(0.3), 'gray', { n: 2, d: k(0.4), op: 0.35, rise: k(0.3) });
      await wait(720);
    }
    await answer([pot, r], yes ? '投過票' : '沒投票', yes ? 'evil' : 'good', { soft: !yes, dy: 1.45 });
  });

  // 城鎮公告員：手搖鈴；爪牙提名過就猛搖，告示展開，沒有就輕輕一晃不出聲
  const towncrier = scene(async (e, me) => {
    const yes = !!e.yes, m = T.mid, c = { x: m.x, y: m.y - k(0.45) };
    cast(me, []);
    await wait(320);
    const b = await emerge('ringing-bell', 'brass', me, { size: k(1), snd: 'tock' });
    await wait(160);
    await fly(b, c, 460, 'brass', { lift: k(0.8), s1: 1.35 });
    await wait(200);
    if (yes) {
      anim(b, [0, -24, 22, -26, 24, -20, 18, -10, 0].map(d => ({ rotate: d + 'deg' })), { duration: 900, fill: 'none' });
      [0, 300, 600].forEach(t => later(t, () => { sfx('bell'); ring(c.x, c.y, 'brass', k(1.3), 2.1, 460); }));
      await wait(760);
      const sc = put(sticker('scroll-unfurled', 'evil'), c.x, c.y + k(0.85), k(1.25));
      sc.style.opacity = 0; sc.style.transformOrigin = '50% 0';
      anim(sc, [{ transform: 'scaleY(.05)', opacity: 0 }, { transform: 'scaleY(1.06)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'ease-out' });
      sfx('page');
      await wait(380);
      return answer([b, sc], '提名過', 'evil', { dy: 1.5 });
    }
    anim(b, [0, -7, 5, -2, 0].map(d => ({ rotate: d + 'deg' })), { duration: 760, fill: 'none', easing: 'ease-in-out' });
    puff(c.x, c.y + k(0.3), 'gray', { n: 2, d: k(0.35), op: 0.3, rise: k(0.25), ms: 800 });
    await wait(800);
    await answer([b], '沒提名', 'good', { soft: true, dy: 0.9 });
  });

  // 神諭者：一排蠟燭擺開，火苗從自己牌裏跳出來，一支支點過去，有幾名死者是邪惡的就點幾支（不指座位）；一支都沒有就滅了
  const candle = () => svgEl('0 0 100 100', `<path d="M41 30h18v46H41z" style="fill:${C.paper};stroke:${C.ink};stroke-width:5;stroke-linejoin:round"/><path d="M50 30V19" style="stroke:${C.ink};stroke-width:4;stroke-linecap:round"/><path d="M22 76h56l-9 14H31z" style="fill:${C.brass};stroke:${C.ink};stroke-width:5;stroke-linejoin:round"/>`);
  const oracle = scene(async (e, me) => {
    const n = e.n | 0, m = T.mid, N = Math.max(3, Math.min(7, n + 1)), gap = Math.min(k(0.9), k(3.6) / N), y = m.y - k(0.05), top = y - k(0.4);
    cast(me, []);
    await wait(320);
    const xs = Array.from({ length: N }, (_, i) => m.x + (i - (N - 1) / 2) * gap), cs = xs.map(x => put(candle(), x, y, k(0.95)));
    cs.forEach(x => { x.style.opacity = 0; });
    for (const x of cs) { beat(x, 'tock'); await wait(130); }
    await wait(200);
    const fl = await emerge('flame', 'evil', me, { size: k(0.5), snd: 'fire' }), lit = [];
    await wait(160);
    for (let i = 0; i < Math.min(n, N); i++) {
      await fly(fl, { x: xs[i], y: top }, i ? 240 : 460, 'evil', { lift: k(i ? 0.3 : 0.7), s1: 0.7, trail: { d: k(0.05) } });
      sfx('fire', 0.6); motes(xs[i], top, 'evil', { n: 3, R: k(0.1), ms: 900 }); squash(cs[i], 0.25);
      const lt = put(sticker('flame', 'evil'), xs[i], top, k(0.35));
      lt.style.transformOrigin = '50% 90%';
      anim(lt, [{ transform: 'scale(.2, .1)' }, { transform: 'scale(1, 1.25)', offset: 0.6 }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
      lit.push(lt);
      await wait(180);
    }
    if (n) fade(fl, 200);
    else { await moveTo(fl, { x: xs[(N - 1) / 2 | 0], y: top }, 460, { lift: k(0.7), s1: 0.7 }); fade(fl, 300); sfx('miss'); puff(xs[(N - 1) / 2 | 0], top, 'gray', { n: 3, d: k(0.35), op: 0.35, rise: k(0.4) }); }
    await wait(300);
    await answer([...cs, ...lit], `${n} 名`, n ? 'evil' : 'good', { dy: 0.98 });
  });

  // 女裁縫：兩人身上各剪下一塊布飛到桌心，針來回縫三針；同陣營打個結，不同陣營一拉就崩開。結果落到兩人身邊
  const seamstress = scene(async (e, me) => {
    const seats = others(e.ids, me), yes = !!e.yes, tone = yes ? 'good' : 'evil', m = T.mid, c = { x: m.x, y: m.y - k(0.2) };
    cast(me, seats);
    await wait(320);
    const W2 = k(0.95), H2 = k(1.2), pc = seats.map((id, i) => {
      const p = at(id), el = put(h('i', { class: 'ab-patch' }), p.x, p.y, W2, H2);
      el.style.opacity = 0;
      anim(el, [{ transform: 'scale(.2)', opacity: 0 }, { transform: `translateY(${-k(0.5)}px) rotate(${i ? 8 : -8}deg)`, opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.3,.9,.4,1)' });
      squash(tokOf(id), 0.5);
      return el;
    });
    sfx('clip');
    await wait(380);
    sfx('whoosh', 0.6);
    await Promise.all(pc.map((el, i) => { stop(el); el.style.opacity = 1; return moveTo(el, { x: c.x + (i ? 1 : -1) * W2 * 0.48, y: c.y }, 420, { lift: k(0.6), rot: 0 }); }));
    sfx('tock');
    const nd = put(sticker('sewing-needle', 'brass'), at(me).x, at(me).y, k(0.85));
    await fly(nd, { x: c.x + k(0.45), y: c.y - H2 * 0.45 }, 380, 'paper', { lift: k(0.5) });
    const sts = [];
    for (let i = 0; i < 3; i++) {
      const y = c.y - H2 * 0.3 + i * H2 * 0.3, s = put(h('i', { class: 'ab-stitch' }), c.x, y, k(0.42), k(0.07));
      s.style.rotate = (i % 2 ? 14 : -14) + 'deg';
      anim(s, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
      await moveTo(nd, { x: c.x + (i % 2 ? 1 : -1) * k(0.45), y: y + H2 * 0.1 }, 170, { lift: k(0.12) });
      sfx('tick'); sts.push(s);
    }
    await wait(180);
    fade(nd, 200);
    // 一拉
    await Promise.all(pc.map((el, i) => moveTo(el, { x: c.x + (i ? 1 : -1) * W2 * (yes ? 0.46 : 0.56), y: c.y }, 150, { lift: 0 })));
    await wait(120);
    if (yes) {
      sfx('tag'); sts.forEach(s => anim(s, [{ scale: '1' }, { scale: '1.2' }, { scale: '1' }], { duration: 220, fill: 'none' })); ring(c.x, c.y, 'good', k(1.4), 2);
    } else {
      sfx('crack'); sts.forEach((s, i) => { anim(s, [{ transform: 'none', opacity: 1 }, { transform: `translate(${(i - 1) * k(0.5)}px, ${-k(0.5)}px) rotate(${i * 90}deg)`, opacity: 0 }], { duration: 340, easing: 'ease-out' }); });
      flecks(c.x, c.y, { n: 8, R: k(1), tones: ['paper', 'evil'] });
      pc.forEach((el, i) => { moveTo(el, { x: c.x + (i ? 1 : -1) * k(1.05), y: c.y + k(0.1) }, 260, { lift: k(0.2), rot: i ? 14 : -14 }); });
    }
    await wait(300);
    const st = await spotStamp({ x: m.x, y: m.y + k(0.95) }, yes ? '同陣營' : '不同陣營', tone, { fs: big() }), p = st.parentElement;
    await hold([...pc, p], 'paper');
    pc.forEach(x => fade(x, 300)); fade(p, 240);
    // 結果是一枚圓牌，一分為二落到兩人身邊（章的大小是 0，不能直接飛）
    const out = put(h('div', { class: 'ab-box' }, disc(tone, icon(yes ? 'check' : 'cross'))), m.x, m.y + k(0.95), k(0.62));
    beat(out, 'tag');
    await wait(240);
    await toSeats(out, seats, '.pmark.auto');
    await finish();
  });

  // 築夢師：捕夢網在桌心落下，兩張牌像羽毛一樣從目標頭上飄進網裏；停一會，牌都落回那個人身邊（其中之一是他）
  const dreamer = scene(async (e, me) => {
    const id = others([e.id], me)[0], p = at(id || me), m = T.mid, c = { x: m.x, y: m.y - k(0.2) };
    cast(me, id ? [id] : []);
    await wait(320);
    const net = put(sticker('dream-catcher', 'night'), c.x, c.y - k(0.75), k(1.5));
    net.style.opacity = 0;
    anim(net, [{ transform: `translateY(${-k(0.7)}px) rotate(-6deg)`, opacity: 0 }, { transform: 'rotate(3deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.3,.8,.4,1)' });
    sfx('hum');
    await wait(520);
    const pair = [[e.good, -1], [e.evil, 1]].map(([r, s], i) => {
      const t = roleCard(r, p.x + s * k(0.3), p.y - k(0.5), k(0.8));
      t.style.opacity = 0;
      anim(t, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: i * 120 });
      return [t, s];
    });
    await wait(360);
    await Promise.all(pair.map(async ([t, s], i) => {
      stop(t); t.style.opacity = 1;
      await wait(i * 120);
      sfx('leaf');
      const b = { x: c.x + s * k(0.78), y: c.y + k(0.25) }, a = posOf(t);
      anim(t, Array.from({ length: 11 }, (_, q) => { const u = q / 10; return { offset: u, transform: `translate(${(b.x - a.x) * u + Math.sin(u * Math.PI * 2.5) * k(0.4)}px, ${(b.y - a.y) * u}px) rotate(${Math.sin(u * Math.PI * 2.5) * 16}deg) scale(${1 + u * 0.56})` }; }), { duration: 900, easing: 'ease-in-out' });
      await wait(900);
      stop(t); place(t, b); t._s = 1.56; t.style.transform = 'scale(1.56)';
      sfx('tag'); ring(b.x, b.y, teamCol(t === pair[0][0] ? e.good : e.evil), k(1.1), 1.8, 420);
    }));
    const st = await spotStamp({ x: m.x, y: m.y + k(1.3) }, '其一', 'brass', { fs: big() });
    await hold([net, pair[0][0], pair[1][0], st.parentElement], 'paper');
    fade(net, 300); fade(st.parentElement, 240);
    await Promise.all([toSeat(pair[0][0], id, 0, rOf(e.good)), toSeat(pair[1][0], id, 90, rOf(e.evil))]);
    await finish();
  });

  // 賢者：貓頭鷹在自己的牌上睜眼，飛到桌心，左看右看（兩個座位各亮一下），「其一是惡魔」；兩枚惡魔圓牌落到兩人身邊
  const sage = scene(async (e, me) => {
    const seats = [e.a, e.b].filter(Boolean), m = T.mid, c = { x: m.x, y: m.y - k(0.3) };
    cast(me, others(seats, me), EVIL_WASH);
    await wait(320);
    const ow = await emerge('owl', 'brass', me, { size: k(1), snd: 'flap' });
    await wait(240);
    const fp = anim(ow.firstChild, [{ scale: '1 1' }, { scale: '1 .75' }, { scale: '1 1' }], { duration: 220, iterations: Infinity, fill: 'none' });
    sfx('flap');
    await fly(ow, c, 620, 'paper', { lift: k(0.9), s1: 1.45, trail: { d: k(0.05), gap: k(0.22) } });
    fp?.cancel(); sfx('caw', 0.6);
    for (const [i, id] of seats.entries()) {
      ow.firstChild.style.scale = at(id).x > c.x ? '-1 1' : '1 1';
      const p = at(id); ring(p.x, p.y, 'evil', k(1.2), 1.7, 460); squash(tokOf(id), 0.4); sfx('tock');
      await wait(i ? 360 : 420);
    }
    ow.firstChild.style.scale = '';
    const st = await spotStamp({ x: m.x, y: m.y + k(0.85) }, '其一是惡魔', 'evil', { fs: Math.max(18, k(0.42)) });
    await hold([ow, st.parentElement], 'evil');
    fade(ow, 300); fade(st.parentElement, 240);
    const dd = put(h('div', { class: 'ab-box' }, disc('evil', roleIcon('imp'))), m.x, m.y + k(0.85), k(0.62));
    beat(dd, 'tag');
    await wait(240);
    await toSeats(dd, seats, '[data-demon]');
    await finish();
  });

  // 鏡像雙子：鏡子立在桌心，鏡面裏顯影出對方的牌；對方的座位亮起，牌落回他身邊。兩邊都看到自己的這一段
  const eviltwin = scene(async (e, me) => {
    const id = others([e.id], me)[0], m = T.mid, c = { x: m.x, y: m.y - k(0.15) };
    cast(me, id ? [id] : [], EVIL_WASH);
    await wait(320);
    const mr = put(sticker('mirror-mirror', 'brass'), c.x, c.y, k(2));
    beat(mr, 'clang'); ring(c.x, c.y, 'brass', k(1.8), 1.7, 460);
    await wait(320);
    if (id) { const p = at(id); ring(p.x, p.y, 'evil', k(1.2), 1.8, 460); squash(tokOf(id), 0.5); wisp(p, c, 'ink', { n: 7, d: k(0.32), op: 0.55, ms: 620 }); }
    sfx('hum');
    await wait(560);
    const tkn = roleCard(e.role, c.x, c.y - k(0.1), k(1.05));
    develop(tkn, 520);
    await wait(500);
    sfx('stamp'); ring(c.x, c.y, teamCol(e.role), k(1.3), 2); tkn.classList.remove('ab-dev');
    const st = await spotStamp({ x: m.x, y: m.y + k(1.2) }, '雙子', 'evil', { fs: big() });
    await hold([mr, tkn, st.parentElement], 'evil');
    fade(mr, 300); fade(st.parentElement, 240);
    await toSeat(tkn, id, 0, rOf(e.role));
    await finish();
  });

  // 被洗腦的人：漩渦在自己牌上轉開，要證明的角色牌在桌心顯影
  const mad = scene(async (e, me) => {
    const m = at(me), mid = T.mid, c = above(me, 1.1);
    wash(EVIL_WASH); const own = lift(me);
    await wait(320);
    const sp = put(sticker('oily-spiral', 'evil'), c.x, c.y, k(1.25));
    sp.style.opacity = 0;
    anim(sp, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,.9,.4,1)' });
    const spin = anim(sp.firstChild, [{ rotate: '0deg' }, { rotate: '-360deg' }], { duration: 900, iterations: Infinity, fill: 'none', easing: 'linear' });
    sfx('hiss'); wiggle(own, 1); motes(m.x, m.y, 'evil', { n: 8, R: k(0.6) });
    await wait(620);
    const tkn = roleCard(e.role, mid.x, mid.y - k(0.1), k(1.75));
    develop(tkn, 460); sfx('hum');
    await wait(440);
    sfx('stamp'); ring(mid.x, mid.y, 'evil', k(1.6), 2.1);
    spin && later(1800, () => spin.cancel());
    fade(sp, 260);
    await answer([tkn], '瘋狂', 'evil', { dy: 1.2, to: tkn });
  });

  // ———— 被換了角色：東西都從桌心來，不洩露是誰幹的；牌翻過去，接著是翻角色牌 ————
  const changed = (name, tone, word, hit, mood = 'evil') => scene(async (e, me) => {
    const m = at(me), mid = T.mid, c = EVIL_WASH;
    wash(c); const own = lift(me, false, e.was || null);
    await wait(320);
    const pr = put(sticker(name, tone), mid.x, mid.y, k(1.1));
    beat(pr, 'hum');
    await wait(320);
    await hit(pr, m, own);
    await wait(200);
    await flipTo(own, e.role);
    ring(m.x, m.y, mood, k(1.4), 2.1); burst(m.x, m.y, mood, { n: 10, R: k(0.9), keep: false });
    await wait(380);
    await seatStamp(me, word, mood, { hold: 420 });
    await finish();
  });
  const CHANGED = {
    // 只有原惡魔走這一段：蛇咬一口，牌翻成舞蛇人，中毒
    snakecharmer: changed('snake', 'good', '中毒', async (pr, m, own) => {
      sfx('swish'); await slither(pr, { x: m.x, y: m.y - k(0.25) }, 620);
      sfx('hiss'); wiggle(pr, 0.8); squash(own, 0.6); develop(blot(m.x, m.y, 'poison', k(1.3), 0.55), 400); fade(pr, 240);
    }, 'poison'),
    barber: changed('razor', 'evil', '交換', async (pr, m, own) => {
      await fly(pr, { x: m.x, y: m.y - k(0.5) }, 420, 'evil', { lift: k(0.6) });
      sfx('slash'); slashAt(m); squash(own, 0.9); burst(m.x, m.y, 'evil', { n: 8, R: k(0.8), keep: false }); fade(pr, 220);
    }),
    pithag: changed('ladle', 'brass', '變身', async (pr, m, own) => {
      await fly(pr, { x: m.x, y: m.y - k(1.2) }, 420, 'poison', { lift: k(0.6), rot: 150 });
      await pour({ x: m.x, y: m.y - k(0.85) }, m, 'poison', own, 4);
      sfx('splat'); develop(blot(m.x, m.y, 'poison', k(1.3), 0.55), 400); fade(pr, 240);
    }),
  };

  // ———— 說書人魔典：被動擋下（2 秒以內）。攻擊的信物飛來，被各自的東西擋掉 ————
  const guard = (name, tone, word, snd, dodge) => scene(async e => {
    const g = e.to[0], a = at(e.seat), b = at(g), atk = put(atkChip(e.src), a.x, a.y, k(0.55));
    ring(a.x, a.y, 'evil', k(1.2), 1.4, 380);
    sfx('whoosh', 0.6);
    moveTo(atk, { x: b.x + (a.x - b.x) * 0.26, y: b.y + (a.y - b.y) * 0.26 - k(0.3) }, 340, { lift: k(0.8) });
    await wait(200);
    const pr = put(sticker(name, tone), b.x, b.y - k(0.75), k(0.9));
    beat(pr, snd); ring(b.x, b.y, tone, k(1.3), 1.6);
    await wait(150);
    if (dodge) {
      anim(tokOf(g), [{ translate: '0 0' }, { translate: `${k(0.4)}px 0`, offset: 0.35 }, { translate: `${k(0.4)}px 0`, offset: 0.65 }, { translate: '0 0' }], { duration: 480, easing: 'ease-in-out', fill: 'none' });
      await moveTo(atk, { x: b.x - k(0.6), y: b.y + k(1.2) }, 340, { lift: 0, ease: 'cubic-bezier(.4,0,1,.7)' });
      fade(atk, 160);
    } else {
      sfx('clang'); squash(pr, 0.8);
      await moveTo(atk, { x: b.x, y: b.y - k(0.7) }, 110, { lift: 0, ease: 'cubic-bezier(.8,0,1,.4)' });
      burst(b.x, b.y - k(0.7), 'brass', { n: 8, R: k(0.7), keep: false, big: 0.6 });
      anim(atk, [{ opacity: 1 }, { opacity: 0, transform: `translate(${k(0.5)}px, ${-k(1)}px) rotate(260deg) scale(.7)` }], { duration: 420, easing: 'ease-out' });
    }
    mk(g, word, 'good');
    await wait(420);
    await finish(200);
  });

  // 吟遊詩人：豎琴一撥，音符飄過每個座位，各落一滴酒
  const stMinstrel = scene(async e => {
    const seats = [...document.querySelectorAll('.seat[data-key]')].map(x => x.dataset.key).filter(id => id !== e.seat), a = at(e.seat);
    const hp = put(sticker('harp', 'brass'), a.x, a.y - k(0.75), k(0.9));
    beat(hp, 'hum'); ring(a.x, a.y, 'brass', k(1.2), 1.5, 380);
    await wait(240);
    await Promise.all(seats.map(async (id, i) => {
      await wait(i * 70);
      const p = at(id), c = put(chip('musical-notes', 'poison'), a.x, a.y, k(0.44));
      await moveTo(c, { x: p.x, y: p.y - k(0.35) }, 360, { lift: k(0.6) });
      sfx('drip', 0.5); squash(tokOf(id), 0.3); fade(c, 200);
      burst(p.x, p.y - k(0.3), 'poison', { n: 4, R: k(0.35), keep: false, big: 0.5 });
    }));
    mk(e.seat, e.word, 'poison');
    await wait(520);
    await finish(200);
  });

  // 方古跳身：獠牙飛到外來者身上，他的牌翻成方古，原來的方古倒下
  const stJump = scene(async e => {
    const id = e.to[0], a = at(e.seat), b = at(id), c = put(chip('bestial-fangs', 'evil'), a.x, a.y, k(0.56));
    ring(a.x, a.y, 'evil', k(1.2), 1.5, 380);
    sfx('whoosh', 0.6);
    await moveTo(c, { x: b.x, y: b.y - k(0.3) }, 420, { lift: k(0.9) });
    sfx('stab'); squash(tokOf(id)); ring(b.x, b.y, 'evil', k(1.3), 2); fade(c, 160);
    await flipTo(lift(id, true), 'fanggu');
    release(e.seat);
    mk(id, '跳身', 'evil');
    await wait(420);
    await finish(200);
  });

  // ———— 全桌 ————
  // 被詛咒的人發起提名：頭上炸開咒印，倒下
  const curse = scene(async e => {
    const id = e.seat, p = at(id);
    wash(PUB_WASH);
    const a = lift(id);
    await wait(260);
    const top = above(id, 0.95), sig = put(sticker('pentacle', 'evil'), top.x, top.y, k(0.95));
    beat(sig, 'hiss'); motes(top.x, top.y, 'evil', { n: 8, R: k(0.5) });
    anim(sig, [{ rotate: '0deg' }, { rotate: '40deg' }], { duration: 700, easing: 'ease-in', fill: 'none' });
    await wait(680);
    sfx('crack'); sfx('stab');
    const r = cen(sig); sig.remove(); T.halves(sticker('pentacle', 'evil'), r.x, r.y, r.w);
    burst(r.x, r.y, 'evil', { n: 18, R: k(1.2), streak: 0.6 }); ring(p.x, p.y, 'evil', k(1.3), 2.2);
    squash(a, 1); anim(a, [{ filter: 'none' }, { filter: 'grayscale(1) brightness(.75)' }], { duration: 420, delay: 80 });
    await wait(300);
    await seatStamp(id, '詛咒', 'evil', { hold: 620 });
    release(id);
    await finish();
  });
  // 夜裏復活的人（教授、反芻）：不說是誰救的，灰牌慢慢恢復顏色，蓋「復活」
  const revive = scene(async e => {
    const id = e.seat, p = at(id);
    wash(PUB_WASH);
    const a = lift(id, true);
    anim(a, [{ filter: 'grayscale(1) brightness(.75)' }, { filter: 'none' }], { duration: 760, delay: 200, easing: 'ease-out' });
    await wait(620);
    sfx('shimmer'); motes(p.x, p.y, 'brass', { n: 12, R: k(0.8), ms: 1500 }); ring(p.x, p.y, 'good', k(1.3), 2);
    await wait(360);
    await seatStamp(id, '復活', 'good', { hold: 820 });
    await finish();
  });
  // 渦流：白天無人處決，桌心的漩渦張開，接邪惡獲勝
  const vortex = scene(async () => {
    const m = T.mid;
    wash(PUB_WASH);
    await wait(260);
    const v = put(sticker('whirlwind', 'evil'), m.x, m.y, k(2.4));
    v.style.opacity = 0;
    anim(v, [{ transform: 'scale(.15)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 620, easing: 'cubic-bezier(.3,.9,.4,1)' });
    const spin = anim(v.firstChild, [{ scale: '1 1' }, { scale: '-1 1' }, { scale: '1 1' }], { duration: 600, iterations: Infinity, fill: 'none', easing: 'linear' });
    sfx('rumble'); sfx('demon');
    for (let i = 0; i < 4; i++) later(200 + i * 240, () => ring(m.x, m.y, 'evil', k(2.2 - i * 0.2), 0.5, 460));
    await wait(1000);
    const st = await spotStamp({ x: m.x, y: m.y + k(1.5) }, '無人處決', 'evil', { fs: big() });
    await wait(900);
    spin?.cancel(); fade(st.parentElement, 240);
    await finish();
  });

  // ———— 接任：方古跳到外來者身上。死去的方古牌上竄起火苗，獠牙飛過來咬住自己的牌（接下去和紅唇女郎、傳位一樣：紅霧流過來，新牌在桌心浮現）————
  async function fangguJump(p, me) {
    flames(p.x, p.y, { n: 5, R: k(0.45) }); sfx('fire');
    const fg = put(sticker('bestial-fangs', 'evil'), p.x, p.y, k(1.05));
    anim(fg, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.3,1.3,.5,1)' });
    sfx('demon');
    await wait(340);
    stop(fg);
    const m = at(me);
    await fly(fg, { x: m.x, y: m.y - k(0.08) }, 460, 'evil', { lift: k(1), trail: { d: k(0.08), gap: k(0.13) } });
    sfx('stab'); sfx('thud'); squash(tokOf(me), 1.2); burst(m.x, m.y, 'evil', { n: 14, R: k(1) });
    fade(fg, 260);
  }

  return {
    // 說書人魔典上的信物
    looks: {
      grandmother: { prop: 'yarn', tone: 'good' }, sailor: { prop: 'anchor', tone: 'brass' }, chambermaid: { prop: 'old-lantern', tone: 'brass' }, exorcist: { prop: 'holy-water', tone: 'good' },
      innkeeper: { prop: 'bed', tone: 'good' }, gambler: { prop: 'rolling-dices', tone: 'brass' }, gossip: { prop: 'talk', tone: 'evil' }, courtier: { prop: 'jeweled-chalice', tone: 'poison' },
      professor: { prop: 'round-bottom-flask', tone: 'good' }, moonchild: { prop: 'moon', tone: 'night' }, godfather: { prop: 'rose', tone: 'evil' }, devilsadvocate: { prop: 'tied-scroll', tone: 'evil' },
      assassin: { prop: 'thrown-daggers', tone: 'evil' }, zombuul: { prop: 'raise-zombie', tone: 'evil' }, pukka: { prop: 'snake-bite', tone: 'poison' }, shabaloth: { prop: 'shark-jaws', tone: 'evil' }, po: { prop: 'small-fire', tone: 'evil' },
      clockmaker: { prop: 'pocket-watch', tone: 'brass' }, dreamer: { prop: 'dream-catcher', tone: 'night' }, snakecharmer: { prop: 'snake', tone: 'good' }, mathematician: { prop: 'abacus', tone: 'brass' },
      flowergirl: { prop: 'flower-pot', tone: 'good' }, towncrier: { prop: 'ringing-bell', tone: 'brass' }, oracle: { prop: 'flame', tone: 'brass' }, juggler: { prop: 'star', tone: 'brass' },
      seamstress: { prop: 'sewing-needle', tone: 'brass' }, philosopher: { prop: 'open-book', tone: 'brass' }, sage: { prop: 'owl', tone: 'brass' }, sweetheart: { prop: 'cupidon-arrow', tone: 'poison' },
      barber: { prop: 'razor', tone: 'evil' }, eviltwin: { prop: 'mirror-mirror', tone: 'brass' }, witch: { prop: 'voodoo-doll', tone: 'evil' }, cerenovus: { prop: 'oily-spiral', tone: 'evil' },
      pithag: { prop: 'cauldron', tone: 'poison' }, fanggu: { prop: 'bestial-fangs', tone: 'evil' }, vigormortis: { prop: 'skeletal-hand', tone: 'ink' }, nodashii: { prop: 'curled-tentacle', tone: 'evil' }, vortox: { prop: 'whirlwind', tone: 'evil' },
    },
    act: { sailor, exorcist, innkeeper, gambler, courtier, professor, godfather, devilsadvocate, assassin, zombuul, pukka, shabaloth, po, snakecharmer, witch, cerenovus, pithag, fanggu, vigormortis, nodashii, vortox, barber },
    pick: { chambermaid: cmPick, dreamer: drPick, seamstress: ssPick, philosopher },
    info: { grandmother, chambermaid, godfather: gfInfo, exorcised, clockmaker, mathematician, flowergirl, towncrier, oracle, seamstress, dreamer, sage, eviltwin, mad },
    changed: CHANGED,
    st: {
      // 普卡下毒，同一拍上一個中毒的人死亡
      pukka: e => (e.res === 'poison' && e.dies?.length ? (async () => { await stFly(e, '中毒', 'blot'); await stKill({ ...e, to: e.dies, each: null }); })() : null),
      // 賭徒猜錯：骰子落在目標上，自己倒下
      gambler: e => (e.res === 'noop' && e.dies?.length ? (async () => { await stFly(e, '猜錯'); await stKill({ ...e, to: e.dies, each: null, seat: e.seat }); })() : null),
      fanggu: e => (e.res === 'starpass' ? stJump(e) : null),
      minstrel: e => (e.word ? stMinstrel(e) : null),
    },
    guard: { tealady: guard('coffee-cup', 'good', '擋下', 'clip'), fool: guard('jester-hat', 'brass', '躲過', 'bell', true), sailor: guard('anchor', 'brass', '不死', 'clang') },
    pub: { curse, revive, vortex },
    demon: { fanggu: fangguJump },
  };
}
