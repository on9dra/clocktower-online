// 角色與劇本數據（服務端和瀏覽器共用）。新增劇本：往 ROLES 加角色，再往 SCRIPTS 加一項，
// 並在 lib/night.js 裏為有夜晚行動的角色寫處理函數。
// first/other：首夜 / 其他夜晚的行動順序（數字越小越早，0 表示不行動），與官方夜晚順序表一致：
// 首夜 爪牙信息 → 惡魔信息 → 投毒者 → 洗衣婦 → 圖書管理員 → 調查員 → 廚師 → 共情者 → 占卜師 → 管家 → 間諜
// 其他 投毒者 → 僧侶 → 小惡魔 → 守鴉人 → 共情者 → 占卜師 → 送葬者 → 管家 → 間諜
export const TEAMS = {
  townsfolk: { name: '鎮民', color: '#2f5d8a', good: true },
  outsider: { name: '外來者', color: '#3f7f86', good: true },
  minion: { name: '爪牙', color: '#a3402e', good: false },
  demon: { name: '惡魔', color: '#8a1c1c', good: false },
};

const R = (id, name, team, ability, first, other, extra = {}) =>
  ({ id, name, team, ability, first, other, ...extra });

export const ROLES = Object.fromEntries([
  R('washerwoman', '洗衣婦', 'townsfolk', '在你的首個夜晚，你會得知兩名玩家和一個鎮民角色：這兩名玩家之一是該角色。', 5, 0),
  R('librarian', '圖書管理員', 'townsfolk', '在你的首個夜晚，你會得知兩名玩家和一個外來者角色：這兩名玩家之一是該角色（或者你會得知沒有外來者在場）。', 6, 0, { needsOutsider: true }),
  R('investigator', '調查員', 'townsfolk', '在你的首個夜晚，你會得知兩名玩家和一個爪牙角色：這兩名玩家之一是該角色。', 7, 0),
  R('chef', '廚師', 'townsfolk', '在你的首個夜晚，你會得知場上鄰座的邪惡玩家有多少對。', 8, 0),
  R('empath', '共情者', 'townsfolk', '每個夜晚，你會得知與你鄰近的兩名存活的玩家中邪惡玩家的數量。', 9, 6),
  R('fortuneteller', '占卜師', 'townsfolk', '每個夜晚，你要選擇兩名玩家：你會得知他們之中是否有惡魔。會有一名善良玩家始終被你的能力當作惡魔。', 10, 7),
  R('undertaker', '送葬者', 'townsfolk', '每個夜晚*，你會得知今天白天死於處決的玩家的角色。', 0, 8),
  R('monk', '僧侶', 'townsfolk', '每個夜晚*，你要選擇除你以外的一名玩家：當晚惡魔的負面能力對他無效。', 0, 2),
  R('ravenkeeper', '守鴉人', 'townsfolk', '如果你在夜晚死亡，你會被喚醒，然後你要選擇一名玩家：你會得知他的角色。', 0, 5),
  R('virgin', '貞潔者', 'townsfolk', '當你第一次被提名時，如果提名你的玩家是鎮民，他立刻被處決。', 0, 0),
  R('slayer', '獵手', 'townsfolk', '每局遊戲限一次，你可以在白天時公開選擇一名玩家：如果他是惡魔，他死亡。', 0, 0),
  R('soldier', '士兵', 'townsfolk', '惡魔的負面能力對你無效。', 0, 0),
  R('mayor', '鎮長', 'townsfolk', '如果只有三名玩家存活且白天沒有人被處決，你的陣營獲勝。如果你在夜晚即將死亡，可能會有一名其他玩家代替你死亡。', 0, 0),
  R('butler', '管家', 'outsider', '每個夜晚，你要選擇除你以外的一名玩家：明天白天，只有他投票時你才能投票。', 11, 9),
  R('drunk', '酒鬼', 'outsider', '你不知道你是酒鬼。你以為你是一個鎮民角色，但其實你不是。', 0, 0),
  R('recluse', '隱士', 'outsider', '你可能會被當作邪惡陣營、爪牙角色或惡魔角色，即使你已死亡。', 0, 0),
  R('saint', '聖徒', 'outsider', '如果你死於處決，你的陣營落敗。', 0, 0),
  R('poisoner', '投毒者', 'minion', '每個夜晚，你要選擇一名玩家：他在當晚和明天白天中毒。', 3, 1),
  R('spy', '間諜', 'minion', '每個夜晚，你能查看魔典。你可能會被當作善良陣營、鎮民角色或外來者角色，即使你已死亡。', 12, 10),
  R('scarletwoman', '紅唇女郎', 'minion', '如果大於等於五名玩家存活時惡魔死亡，你變成那個惡魔。（旅行者不計算在內）', 0, 0),
  R('baron', '男爵', 'minion', '會有額外的外來者在場。[+2 外來者]', 0, 0, { setup: { outsider: 2 } }),
  R('imp', '小惡魔', 'demon', '每個夜晚*，你要選擇一名玩家：他死亡。如果你以這種方式自殺，一名爪牙會變成小惡魔。', 0, 4),
].map(r => [r.id, r]));

export const SCRIPTS = {
  tb: {
    name: '暗流湧動',
    en: 'Trouble Brewing',
    roles: ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker',
      'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor', 'butler', 'drunk', 'recluse', 'saint',
      'poisoner', 'spy', 'scarletwoman', 'baron', 'imp'],
  },
};

// 人數配置：[鎮民, 外來者, 爪牙, 惡魔]
export function distribution(n) {
  const t = {
    5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
    10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1],
  };
  return t[Math.max(5, Math.min(n, 15))] || [9, 2, 3, 1];
}

// 本局各類角色的數量（男爵等角色會改變配置）
export function teamCounts(n, minions = []) {
  const [townsfolk, outsider, minion, demon] = distribution(n);
  const c = { townsfolk, outsider, minion, demon };
  for (const id of minions) { const x = ROLES[id]?.setup?.outsider || 0; c.townsfolk -= x; c.outsider += x; }
  return c;
}

// 配置里沒有外來者時，隨機抽取默認排除和外來者相關的鎮民（說書人設為必選則仍會出現）
export const skippedForNoOutsider = (id, c) => !!ROLES[id]?.needsOutsider && c.outsider === 0;

export const isEvilRole = id => !!ROLES[id] && !TEAMS[ROLES[id].team].good;
