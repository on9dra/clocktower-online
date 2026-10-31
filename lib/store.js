// 房間存儲：內存 Map + 寫盤（服務重啓後房間仍在）。每個房間一個文件，只寫有改動的
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { registerScript, dropScript } from './script.js';

const DATA = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DIR = path.join(DATA, 'rooms'), OLD = path.join(DATA, 'rooms.json'); // OLD：舊版本所有房間存在一個文件裏
const MAX_AGE = 3 * 24 * 3600 * 1000; // 三天沒有動靜的房間會被清理
export const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 99;
// 房間滿了才騰：沒有真人玩家、10 分鐘沒動靜的空房先騰；其次是 6 小時沒動靜的。都要沒人連著
const EMPTY_IDLE = 10 * 60 * 1000, IDLE = 6 * 3600 * 1000;
const rooms = new Map();
const dirty = new Set(); // 等著寫盤的房間號（房間已刪的話刪文件）
let saveTimer = null, saving = null; // saving：正在異步寫的那一批房間號

export const rid = (n = 4) => crypto.randomBytes(n).toString('hex');

export function newSeat(pid, name) {
  return { id: rid(), pid, name, online: true, role: null, fakeRole: null, dead: false, voteUsed: false };
}

// 一局遊戲的全部流程狀態，開新局時整體替換
export function newGame() {
  return {
    night: 0, day: 0,
    poisoned: null, protected: null, redHerring: null, bluffs: [],
    bluffsOf: {}, // 座位 -> 惡魔信息裏告訴他的三個偽裝角色（瘋子拿到的是假的一份）
    diedTonight: [], lastNight: [], executedToday: null, lastExecutedRole: null, lastExecutedId: null,
    nominators: [], nominees: [], dayOver: false,
    virginUsed: false, slayerUsed: false, virginCheck: null,
    master: {}, // 管家座位 -> 主人座位
    eff: [], // 狀態效果：中毒、醉酒、保護……（見 util.js addEff）
    used: {}, // 每局限一次的能力：`角色:座位` -> true
    lastPick: {}, // 座位 -> 上一晚選的人（不能連續選同一人的角色）
    woke: [], // 今晚因自己能力被喚醒過的座位（侍女）
    voted: [], nominatedBy: [], diedToday: false, outsiderDied: false, // 今天白天的記錄（賣花女孩、城鎮公告員、僵怖、教父）
    queue: [], step: null,
    marks: {}, // seatId -> [說書人可見的提示文字]
    manual: false, cards: [], ticks: [], evilSent: false, // 手動局：選人牌、參考表上勾掉的角色、首夜互認發過沒有（見 manual.js）
    log: [], // 說書人流程日誌
  };
}

const idleFor = r => Date.now() - (r.updatedAt || r.createdAt);
const empty = r => !r.seats.some(s => !String(s.pid).startsWith('bot:'));
// 滿了以後騰哪個房間：沒有的話返回 undefined
function victim(online) {
  const free = [...rooms.values()].filter(r => !online(r.code));
  const oldest = list => list.sort((a, b) => idleFor(b) - idleFor(a))[0];
  return oldest(free.filter(r => empty(r) && idleFor(r) > EMPTY_IDLE)) || oldest(free.filter(r => idleFor(r) > IDLE));
}

// 建房前調用：房間滿了就騰一個出來，騰不出來返回 false。online(code) 為真表示還有人連著
export function makeSpace(online) {
  if (rooms.size < MAX_ROOMS) return true;
  const v = victim(online);
  if (v) remove(v.code);
  return !!v;
}

export function createRoom() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  const room = {
    code, stKey: rid(12), createdAt: Date.now(), updatedAt: Date.now(),
    inst: rid(3), // 房號會回收再用：鏈接帶上它，過期的舊鏈接不會進到後來用這個號的房間
    pass: '', // 房間密碼：新來的人要輸對（已經在座的可以直接重連）
    banned: [], // 被移出的玩家（pid），不能再加入
    scriptId: 'tb',
    phase: 'lobby', // lobby | night | dawn | day | ended
    seats: [],
    g: newGame(),
    nomination: null,
    history: [],
    chat: [], chatSeq: 0, chatEpoch: rid(),
    fx: [], fxSeq: 0, // 演出事件（見 util.js fx）
    players: {}, // pid -> { eggs, wins, mvp }（見 score.js）
    result: null, mvp: null, games: 0, // 上一局的勝負（皇冠、煙花）、MVP 投票、開過幾局
    eggs: [], eggSeq: 0, // 扔雞蛋事件
    winner: null, winReason: '',
    settings: { roleRules: {} },
    draft: false,
    stOnline: false,
  };
  rooms.set(code, room);
  return room;
}

export const get = code => (code ? rooms.get(String(code)) : undefined);
export const touch = room => { room.updatedAt = Date.now(); };
export function remove(code) {
  if (rooms.has(code)) dropScript(rooms.get(code));
  rooms.delete(code);
  dirty.add(code);
  schedule();
}

// 記下要寫盤的房間，攢 0.5 秒一起寫
export function save(room) {
  dirty.add(room.code);
  schedule();
}
function schedule() {
  if (!saveTimer && !saving) saveTimer = setTimeout(flush, 500);
}
const fileOf = code => path.join(DIR, code + '.json');
// 先寫臨時文件再改名：寫到一半崩潰也不會弄壞存檔。寫的時候又有改動的，寫完再來一輪
async function flush() {
  saveTimer = null;
  const codes = saving = [...dirty];
  dirty.clear();
  try {
    await fs.promises.mkdir(DIR, { recursive: true });
    for (const code of codes) {
      const r = rooms.get(code), file = fileOf(code);
      try {
        if (!r) await fs.promises.rm(file, { force: true });
        else { await fs.promises.writeFile(file + '.tmp', JSON.stringify(r)); await fs.promises.rename(file + '.tmp', file); }
      } catch (e) { console.error('保存房間失敗', code, e.message); }
    }
  } catch (e) { console.error('保存房間失敗', e.message); }
  saving = null;
  if (dirty.size) schedule();
}
// 退出前把還沒寫的（包括正在異步寫的那批）同步寫完（systemd 重啓、Ctrl+C）
export function flushSync() {
  clearTimeout(saveTimer);
  fs.mkdirSync(DIR, { recursive: true });
  for (const code of new Set([...dirty, ...(saving || [])])) {
    const r = rooms.get(code);
    if (!r) fs.rmSync(fileOf(code), { force: true });
    else fs.writeFileSync(fileOf(code), JSON.stringify(r));
  }
  dirty.clear();
}

const fresh = r => idleFor(r) < MAX_AGE;

// 讀一個存檔文件；損壞的留一份備份方便排查，不要悄悄覆蓋掉
function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    const bad = file + '.bad-' + Date.now();
    fs.copyFileSync(file, bad);
    console.error(`房間存檔讀取失敗，已備份到 ${bad}`, e.message);
    return null;
  }
}

export function load() {
  // 舊版本的單文件存檔：讀進來、按房間拆開寫，原文件改名留著
  if (fs.existsSync(OLD)) {
    const list = read(OLD);
    if (list) {
      for (const r of list) if (fresh(r)) { rooms.set(r.code, upgrade(r)); dirty.add(r.code); }
      flushSync();
      fs.renameSync(OLD, OLD + '.migrated');
    }
  }
  if (fs.existsSync(DIR)) {
    for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
      const r = read(path.join(DIR, f));
      if (r && fresh(r)) rooms.set(r.code, upgrade(r));
      else if (r) fs.rmSync(path.join(DIR, f));
    }
  }
  console.log(`已恢復 ${rooms.size} 個房間`);
}

// 舊版本存下來的房間補齊新字段
function upgrade(r) {
  r.g = { ...newGame(), ...r.g };
  r.settings = { roleRules: {}, ...r.settings };
  r.chatEpoch ||= rid();
  r.inst ||= rid(3);
  r.banned ||= [];
  r.players ||= {};
  r.eggs ||= [];
  registerScript(r);
  let seq = 0;
  for (const m of r.chat) m.seq = seq = Math.max(seq + 1, m.seq || 0);
  r.chatSeq = Math.max(r.chatSeq || 0, seq);
  return r;
}

// 定期清理長時間沒人用的房間；online(code) 為真表示還有人連著
export function sweep(online) {
  for (const [code, r] of rooms) if (!fresh(r) && !online(code)) remove(code);
}
