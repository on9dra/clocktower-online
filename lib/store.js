// 房間存儲：內存 Map + 寫盤（服務重啓後房間仍在）
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rooms.json');
const MAX_AGE = 3 * 24 * 3600 * 1000; // 三天沒有動靜的房間會被清理
const rooms = new Map();
let saveTimer = null;

export const rid = (n = 4) => crypto.randomBytes(n).toString('hex');

export function newSeat(pid, name) {
  return { id: rid(), pid, name, online: true, role: null, fakeRole: null, dead: false, voteUsed: false };
}

// 一局遊戲的全部流程狀態，開新局時整體替換
export function newGame() {
  return {
    night: 0, day: 0,
    poisoned: null, protected: null, redHerring: null, bluffs: [],
    diedTonight: [], lastNight: [], executedToday: null, lastExecutedRole: null, lastExecutedId: null,
    nominators: [], nominees: [], dayOver: false,
    virginUsed: false, slayerUsed: false, virginCheck: null,
    master: {}, // 管家座位 -> 主人座位
    queue: [], step: null,
    marks: {}, // seatId -> [說書人可見的提示文字]
    log: [], // 說書人流程日誌
  };
}

export function createRoom() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  const room = {
    code, stKey: rid(12), createdAt: Date.now(), updatedAt: Date.now(),
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

// 先寫臨時文件再改名：寫到一半崩潰也不會弄壞存檔
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify([...rooms.values()]), err => {
      if (err) return console.error('保存房間失敗', err);
      fs.rename(tmp, FILE, e => e && console.error('保存房間失敗', e));
    });
  }, 500);
}

const fresh = r => Date.now() - (r.updatedAt || r.createdAt) < MAX_AGE;

export function load() {
  if (!fs.existsSync(FILE)) return;
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const r of list) if (fresh(r)) rooms.set(r.code, upgrade(r));
    console.log(`已恢復 ${rooms.size} 個房間`);
  } catch (e) {
    // 存檔損壞：留一份備份方便排查，不要悄悄覆蓋掉
    const bad = FILE + '.bad-' + Date.now();
    fs.copyFileSync(FILE, bad);
    console.error(`房間存檔讀取失敗，已備份到 ${bad}`, e.message);
  }
}

// 舊版本存下來的房間補齊新字段
function upgrade(r) {
  r.g = { ...newGame(), ...r.g };
  r.settings = { roleRules: {}, ...r.settings };
  r.chatEpoch ||= rid();
  r.players ||= {};
  r.eggs ||= [];
  let seq = 0;
  for (const m of r.chat) m.seq = seq = Math.max(seq + 1, m.seq || 0);
  r.chatSeq = Math.max(r.chatSeq || 0, seq);
  return r;
}

// 定期清理長時間沒人用的房間；online(code) 為真表示還有人連著
export function sweep(online) {
  for (const [code, r] of rooms) if (!fresh(r) && !online(code)) rooms.delete(code);
}
