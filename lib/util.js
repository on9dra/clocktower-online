// 引擎共用的小工具：座位查詢、隨機、消息
import { ROLES, TEAMS, SCRIPTS, FAKE } from '../public/js/roles.js';
import { rid } from './store.js';
import { trimChat } from '../public/js/infofmt.js';

export const shuffle = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const pick = a => a[Math.floor(Math.random() * a.length)];

export const seatById = (room, id) => room.seats.find(s => s.id === id);
export const label = (room, id) => {
  const i = room.seats.findIndex(s => s.id === id);
  return i < 0 ? '?' : `${i + 1}號${room.seats[i].name}`;
};
export const roleName = id => (ROLES[id] ? ROLES[id].name : '?');
// 角色身份：獲得了能力的哲學家還是哲學家（座位上換成了他選的角色，was 記著原來的），角色類型、信息裏的角色都按這個
export const charOf = seat => (seat.was === 'philosopher' ? 'philosopher' : seat.role);
export const teamOf = seat => ROLES[charOf(seat)]?.team;
// 陣營：默認跟角色走，莽夫、鏡像雙子等會改變（seat.align）
export const alignOf = seat => seat.align || (seat.role && TEAMS[teamOf(seat)]?.good === false ? 'evil' : 'good');
export const isEvil = seat => !!seat.role && alignOf(seat) === 'evil';
export const isGoodSeat = seat => !!seat.role && alignOf(seat) === 'good';
// 僵怖第一次死亡後還活著，只是被當作死亡（undead）
export const reallyAlive = s => !s.dead || !!s.undead;
export const alive = room => room.seats.filter(s => !s.dead);
// 劇本最多幾人：小劇本（社區劇本裏標 5-6人 的）6 人，其餘 15 人
export const maxSeats = room => (room.scriptId === 'custom' && room.script?.max) || 15;
export const scriptRoles = room => (room.scriptId === 'custom' ? room.script.roles : SCRIPTS[room.scriptId].roles);
// 線上 / 線下都由系統判規則（智能推進）。線下：說書人當面主持、替玩家點選；又分多設備（每人一台手機看身份和收到的信息）
// 和單設備（只有說書人這一台，座位是他加的名字）
export const offline = room => room.settings?.venue === 'offline';
export const oneDevice = room => offline(room) && room.settings?.devices === 'one';
export const teamRoles = (room, team) => scriptRoles(room).filter(id => ROLES[id].team === team);
export const hasDemon = room => room.seats.some(s => reallyAlive(s) && teamOf(s) === 'demon');
// 雜耍藝人的「第一個白天」：開局就是雜耍藝人的是第 1 天；夜裏才變成雜耍藝人的（哲學家、麻臉巫婆、理髮師）是接下來那一天
export const jugglerDay = (room, s) => room.g.jugglerDay?.[s.id] ?? 1;
export const once = (room, key) => !!room.g.used?.[key];
export const useOnce = (room, key) => { (room.g.used ||= {})[key] = true; };

// 酒鬼以為自己是某個鎮民、瘋子以為自己是惡魔、提線木偶以為自己是善良角色：按以為的角色被喚醒（表在 roles.js，瀏覽器也用）
export { FAKE };
export const actingRole = seat => seat.fakeRole || seat.role;
// 兩個座位相鄰（不管死活）：提線木偶要和惡魔鄰座
export const nextTo = (room, a, b) => {
  const n = room.seats.length, i = room.seats.indexOf(a), j = room.seats.indexOf(b);
  return i >= 0 && j >= 0 && i !== j && ((i - j + n) % n === 1 || (j - i + n) % n === 1);
};

// 占卜師的紅鯡魚：場上有占卜師（含以為自己是占卜師的酒鬼）才分配；局中途出現占卜師時補一個
export const hasFortuneTeller = room => room.seats.some(s => actingRole(s) === 'fortuneteller');
export function ensureHerring(room) {
  const g = room.g;
  if (g.redHerring || !hasFortuneTeller(room)) return;
  g.redHerring = pick(room.seats.filter(s => isGoodSeat(s) && actingRole(s) !== 'fortuneteller'))?.id || null;
  if (g.redHerring && room.phase !== 'lobby') stLog(room, `占卜師的紅鯡魚：${label(room, g.redHerring)}`, { k: 'fix', what: 'herring', seat: g.redHerring });
}

// 階段刻度：第 N 夜 = 2N，第 N 天 = 2N+1。狀態效果（g.eff）在刻度超過 till 後失效
export const FOREVER = 1e9;
export const tick = room => 2 * room.g.night + (room.phase === 'night' ? 0 : 1);
// kind：poison 中毒 / drunk 醉酒 / protect 夜裏不死（旅店老闆）/ safe 明天處決不死（魔鬼代言人）/ curse 提名就死（女巫）/ mad 瘋狂（洗腦師）
// by：效果來自哪個座位（魔鬼代言人失效時保護跟著沒，哲學家死亡時酒醒）
// extra：live 跟著來源走（來源死了、換了角色或失去能力就暫停，恢復後接著生效）；madAs 洗腦師要他證明的角色
export function addEff(room, seatId, kind, src, till, by, extra) {
  (room.g.eff ||= []).push({ seat: seatId, kind, src, till, ...(by && { by }), ...extra });
}
const tracing = new Set();
function sourceOn(room, e) {
  if (!e.live || tracing.has(e)) return true; // 兩個效果互相依賴時不再往下算
  tracing.add(e);
  const s = seatById(room, e.by);
  // 哲學家換成了拿到的角色，靠 was 認他還有這份能力
  const holds = !!s && (e.src === 'philosopher' ? s.was === 'philosopher' : s.role === e.src);
  const on = holds && (reallyAlive(s) || keptAbility(room, s)) && !impaired(room, s);
  tracing.delete(e);
  return on;
}
// 亡骨魔殺死的爪牙：死後保留能力，只到亡骨魔死亡或失去能力為止
export const keptAbility = (room, s) => !!s.keep && room.seats.some(v => v.role === 'vigormortis' && reallyAlive(v) && !impaired(room, v));
export const effsOf = (room, s, kind) => (room.g.eff || []).filter(e => e.seat === s.id && e.kind === kind && tick(room) <= e.till && sourceOn(room, e));
export const hasEff = (room, s, kind) => effsOf(room, s, kind).length > 0;
// 某個來源的效果整體撤銷（普卡換人、舞蛇人交換後原來的效果等）
export const dropEff = (room, test) => { room.g.eff = (room.g.eff || []).filter(e => !test(e)); };

// 諾-達鯴的鎮民鄰居：順時針、逆時針各找最近的鎮民（死活都算）
export function nodashiiVictims(room) {
  const nd = room.seats.find(s => s.role === 'nodashii' && reallyAlive(s));
  if (!nd || room.g.poisoned === nd.id || effsOf(room, nd, 'poison').length || effsOf(room, nd, 'drunk').length) return [];
  const n = room.seats.length, i = room.seats.indexOf(nd), out = new Set();
  for (const dir of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const s = room.seats[(i + dir * k + n) % n];
      if (teamOf(s) === 'townsfolk') { out.add(s.id); break; }
    }
  }
  return [...out];
}
export const isPoisoned = (room, s) => room.g.poisoned === s.id || hasEff(room, s, 'poison') || nodashiiVictims(room).includes(s.id);
export const isDrunk = (room, s) => !!FAKE[s.role] || hasEff(room, s, 'drunk');
// 能力失效：酒鬼 / 瘋子（沒有能力）、醉酒、中毒
export const impaired = (room, seat) => isDrunk(room, seat) || isPoisoned(room, seat);
// 失效的原因（給說書人卡片上的短詞）
export const whyImpaired = (room, s) => (s.role === 'drunk' ? '酒鬼' : s.role === 'lunatic' ? '瘋子' : s.role === 'marionette' ? '提線木偶' : isDrunk(room, s) ? '醉酒' : '中毒');
// 數學家：從黎明起，能力因別人而失常的玩家，一人只算一次。酒鬼、瘋子本來就沒有能力，不算；
// 提線木偶算（官方相剋：數學家會得知提線木偶的能力給了錯誤信息或沒有正常生效）
export function abnormal(room, s) {
  const g = room.g;
  if (s && (!FAKE[s.role] || s.role === 'marionette') && !(g.abnormal ||= []).includes(s.id)) g.abnormal.push(s.id);
}
// 被動能力此刻該觸發：能力正常才生效；中毒 / 醉酒時沒生效，記給數學家
export const fires = (room, s) => { if (!impaired(room, s)) return true; abnormal(room, s); return false; };

// 隱士、間諜的「登記」：能力正常時，說書人可以讓他們被當作另一類角色 / 另一陣營
export function teamsAs(room, s) {
  if (impaired(room, s)) return [teamOf(s)];
  if (s.role === 'recluse') return ['outsider', 'minion', 'demon'];
  if (s.role === 'spy') return ['minion', 'townsfolk', 'outsider'];
  return [teamOf(s)];
}
// 能被當作的陣營（true = 邪惡）。陣營被改過的玩家（莽夫等）按實際陣營
export const evilAs = (room, s) => (s.align ? [isEvil(s)] : [...new Set(teamsAs(room, s).map(t => !TEAMS[t].good))]);
// 某名玩家可以被當作哪些角色（真實角色以外的合規答案）
export function rolesAs(room, s) {
  const teams = teamsAs(room, s).filter(t => t !== teamOf(s));
  return scriptRoles(room).filter(id => teams.includes(ROLES[id].team));
}

// 往左右各找最近的存活玩家
export function aliveNeighbors(room, seat) {
  const n = room.seats.length, i = room.seats.indexOf(seat), out = [];
  for (const dir of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const s = room.seats[(i + dir * k + n) % n];
      if (s === seat) break;
      if (!s.dead) { out.push(s); break; }
    }
  }
  return out[0] === out[1] ? out.slice(0, 1) : out; // 只剩自己活著時是空的（一晚死很多人、還沒天亮）
}

// 說書人魔典上座位的狀態標籤（間諜看魔典時也用這一份）
const EFF_TAG = { protect: '被保護', safe: '處決不死', curse: '詛咒' };
export function seatTags(room, s) {
  const g = room.g, t = [];
  if (isPoisoned(room, s)) t.push('中毒');
  if (hasEff(room, s, 'drunk')) t.push('醉酒');
  if (room.phase === 'night' && g.protected === s.id) t.push('被保護');
  for (const k in EFF_TAG) if (hasEff(room, s, k)) t.push(EFF_TAG[k]);
  for (const e of effsOf(room, s, 'mad')) t.push(e.madAs ? `瘋狂：${roleName(e.madAs)}` : '瘋狂');
  if (g.poCharge?.[s.id]) t.push('蓄力');
  if (g.mastermindDay && s.role === 'mastermind') t.push('額外一天');
  if (s.align && s.align !== (TEAMS[teamOf(s)]?.good ? 'good' : 'evil')) t.push(s.align === 'evil' ? '邪惡' : '善良');
  if (s.undead) t.push('假死');
  if (ROLES[s.role]?.once && once(room, s.role + ':' + s.id)) t.push('能力已用');
  if (g.redHerring === s.id) t.push('紅鯡魚');
  if (actingRole(s) === 'virgin' && g.virginUsed) t.push('能力已用');
  if (s.role === 'slayer' && g.slayerUsed) t.push('能力已用');
  if (s.dead && s.voteUsed) t.push('死亡票已用');
  return t.concat(g.marks[s.id] || []);
}
// 說書人點座位上的標記看解釋卡：這個標記是誰的能力造成的、到什麼時候。{ 標記: [{ src 角色, by 座位, till 到哪一拍（tick）, live 跟著來源走 }] }
// 只列有來源的（中毒、醉酒、保護、處決不死、詛咒、瘋狂、紅鯡魚、主人、孫子）；能力已用、假死這些是他自己的角色
export function tagWhy(room, s) {
  const g = room.g, out = {}, put = (t, e) => (out[t] ||= []).push(e);
  const holder = r => room.seats.find(x => x.role === r) || room.seats.find(x => x.fakeRole === r);
  const by = (t, r, till) => { const h = holder(r); put(t, { src: h ? r : null, by: h?.id || null, till }); };
  // 普卡的毒記成「整局」，其實到下一夜他死去為止：卡上說成今天 / 明天晚上。沒記來源座位的（旅店老闆、普卡……）按誰拿著這個角色補上
  const effs = (t, kind) => { for (const e of effsOf(room, s, kind)) put(typeof t === 'function' ? t(e) : t, { src: e.src || null, by: e.by || (e.src && holder(e.src)?.id) || null, till: e.src === 'pukka' ? 2 * g.night + 1 : e.till, live: !!e.live }); };
  if (g.poisoned === s.id) by('中毒', 'poisoner', 2 * g.night + 1); // 投毒者的毒到明天白天結束（入夜時清掉）
  effs('中毒', 'poison');
  if (nodashiiVictims(room).includes(s.id)) { const nd = room.seats.find(x => x.role === 'nodashii' && reallyAlive(x)); put('中毒', { src: 'nodashii', by: nd?.id || null, live: true }); }
  effs('醉酒', 'drunk');
  if (room.phase === 'night' && g.protected === s.id) by('被保護', 'monk', 2 * g.night);
  effs('被保護', 'protect');
  effs('處決不死', 'safe');
  effs('詛咒', 'curse');
  effs(e => (e.madAs ? `瘋狂：${roleName(e.madAs)}` : '瘋狂'), 'mad');
  if (g.redHerring === s.id) by('紅鯡魚', 'fortuneteller', FOREVER);
  const marks = g.marks?.[s.id] || [];
  if (marks.includes('管家的主人')) by('管家的主人', 'butler', 2 * g.night + 1);
  if (marks.includes('孫子')) by('孫子', 'grandmother', FOREVER);
  return out;
}

export function pushChat(room, msg) {
  room.chatSeq = (room.chatSeq || 0) + 1;
  room.chat.push({ id: rid(), seq: room.chatSeq, at: Date.now(), ...msg });
  room.chat = trimChat(room.chat);
}
// 清空聊天（新的一局）：chatEpoch 變化後，客戶端會整體重新拉取
export function resetChat(room) {
  room.chat = [];
  room.chatEpoch = rid();
}
// e：給遊戲日誌按輕重排版用的結構（k：start / night / dawn / day / nom / votes / count / cancel / slay / slayhit / slaymiss / virgin / execute / noexec / win / lobby）
export const announce = (room, text, e) => pushChat(room, { from: 'sys', fromName: '系統', to: 'all', text, ...(e && { e }) });
// 說書人私下告訴某位玩家的信息（玩家在左上角面板裏看到）
// marks：[{ seatId, r | t | demon, text }]，玩家端會把它們自動標在對應座位上
// extra：f 信息式子（見 infofmt.js）、src 來源角色、k 類型（role 發角色 / act 自己的行動）
export const tell = (room, seatId, text, marks, extra = {}) =>
  pushChat(room, { from: 'st', fromName: '說書人', to: seatId, text, info: true, night: room.g.night, marks: marks || [], ...extra });
// 說書人流程日誌：text 是文字版，e 是給日誌畫式子用的結構（k：setup / act / info / death / demon / nom / votes / slay / fix …）
// 一局最多記這麼多條（正常一局幾百條）：寫滿就不再記，不從前面刪——客戶端按條數增量拉取，刪前面會錯位
export const LOG_MAX = 3000;
// at：插到第幾條（夜晚行動先記「殺死 ③」，結算時已經記下的「③ 死亡」排在它後面）
// real：行動者其實是酒鬼 / 瘋子 / 提線木偶、以為自己是這個角色時，記下真實角色（日誌寫「酒鬼 以為是 圖書管理員」，之後換了角色也不變）
export const stLog = (room, text, e, at) => {
  if (room.g.log.length >= LOG_MAX) return;
  const s = e?.seat && seatById(room, e.seat), as = e && (e.src || e.role);
  if (s && as && FAKE[s.role] && s.fakeRole === as && as !== s.role) e = { ...e, real: s.role };
  const l = { at: Date.now(), text, e, phase: room.phase, night: room.g.night, day: room.g.day };
  if (at != null && at < room.g.log.length) room.g.log.splice(at, 0, l); else room.g.log.push(l);
};
// 計時器回調裏拋出的錯誤沒人接得住，會帶走整個進程（所有房間一起斷線）：記下來就算了
export const guard = fn => (...a) => { try { return fn(...a); } catch (e) { console.error(e); } };
// 演出事件：客戶端按序號播放。aud：all 所有人、st 只給說書人、座位 id 只給該玩家
export function fx(room, ev, aud = 'all') {
  room.fxSeq = (room.fxSeq || 0) + 1;
  (room.fx ||= []).push({ ...ev, seq: room.fxSeq, at: Date.now(), aud });
  if (room.fx.length > 40) room.fx.splice(0, room.fx.length - 40);
}
export function mark(room, seatId, text) {
  (room.g.marks[seatId] ||= []).push(text);
}
