// 角色與劇本數據（服務端和瀏覽器共用）。新增劇本：往 ROLES 加角色，再往 SCRIPTS 加一項，
// 並在 lib/night.js 裏為有夜晚行動的角色寫處理函數。
// first/other：首夜 / 其他夜晚的行動順序（數字越小越早，0 表示不行動），與官方夜晚順序表一致：
// 數字取自官方總夜晚順序表（townsquare），三個劇本共用一套；爪牙信息 6、惡魔信息 9（見 lib/engine.js）
// once：每局限一次的能力；setup.outsider：改變外來者數量（數組表示說書人二選一，抽角色時隨機）
export const TEAMS = {
  townsfolk: { name: '鎮民', color: '#2f5d8a', good: true },
  outsider: { name: '外來者', color: '#3f7f86', good: true },
  minion: { name: '爪牙', color: '#a3402e', good: false },
  demon: { name: '惡魔', color: '#8a1c1c', good: false },
};

const R = (id, name, team, ability, first, other, extra = {}) =>
  ({ id, name, team, ability, first, other, ...extra });

export const ROLES = Object.fromEntries([
  R('washerwoman', '洗衣婦', 'townsfolk', '在你的首個夜晚，你會得知兩名玩家和一個鎮民角色：這兩名玩家之一是該角色。', 33, 0),
  R('librarian', '圖書管理員', 'townsfolk', '在你的首個夜晚，你會得知兩名玩家和一個外來者角色：這兩名玩家之一是該角色（或者你會得知沒有外來者在場）。', 34, 0, { needsOutsider: true }),
  R('investigator', '調查員', 'townsfolk', '在你的首個夜晚，你會得知兩名玩家和一個爪牙角色：這兩名玩家之一是該角色。', 35, 0),
  R('chef', '廚師', 'townsfolk', '在你的首個夜晚，你會得知場上鄰座的邪惡玩家有多少對。', 36, 0),
  R('empath', '共情者', 'townsfolk', '每個夜晚，你會得知與你鄰近的兩名存活的玩家中邪惡玩家的數量。', 37, 53),
  R('fortuneteller', '占卜師', 'townsfolk', '每個夜晚，你要選擇兩名玩家：你會得知他們之中是否有惡魔。會有一名善良玩家始終被你的能力當作惡魔。', 38, 54),
  R('undertaker', '送葬者', 'townsfolk', '每個夜晚*，你會得知今天白天死於處決的玩家的角色。', 0, 55),
  R('monk', '僧侶', 'townsfolk', '每個夜晚*，你要選擇除你以外的一名玩家：當晚惡魔的負面能力對他無效。', 0, 12),
  R('ravenkeeper', '守鴉人', 'townsfolk', '如果你在夜晚死亡，你會被喚醒，然後你要選擇一名玩家：你會得知他的角色。', 0, 52),
  R('virgin', '貞潔者', 'townsfolk', '當你第一次被提名時，如果提名你的玩家是鎮民，他立刻被處決。', 0, 0),
  R('slayer', '獵手', 'townsfolk', '每局遊戲限一次，你可以在白天時公開選擇一名玩家：如果他是惡魔，他死亡。', 0, 0),
  R('soldier', '士兵', 'townsfolk', '惡魔的負面能力對你無效。', 0, 0),
  R('mayor', '鎮長', 'townsfolk', '如果只有三名玩家存活且白天沒有人被處決，你的陣營獲勝。如果你在夜晚即將死亡，可能會有一名其他玩家代替你死亡。', 0, 0),
  R('butler', '管家', 'outsider', '每個夜晚，你要選擇除你以外的一名玩家：明天白天，只有他投票時你才能投票。', 39, 67),
  R('drunk', '酒鬼', 'outsider', '你不知道你是酒鬼。你以為你是一個鎮民角色，但其實你不是。', 0, 0),
  R('recluse', '隱士', 'outsider', '你可能會被當作邪惡陣營、爪牙角色或惡魔角色，即使你已死亡。', 0, 0),
  R('saint', '聖徒', 'outsider', '如果你死於處決，你的陣營落敗。', 0, 0),
  R('poisoner', '投毒者', 'minion', '每個夜晚，你要選擇一名玩家：他在當晚和明天白天中毒。', 17, 7),
  R('spy', '間諜', 'minion', '每個夜晚，你能查看魔典。你可能會被當作善良陣營、鎮民角色或外來者角色，即使你已死亡。', 49, 68),
  R('scarletwoman', '紅唇女郎', 'minion', '如果大於等於五名玩家存活時惡魔死亡，你變成那個惡魔。（旅行者不計算在內）', 0, 0),
  R('baron', '男爵', 'minion', '會有額外的外來者在場。[+2 外來者]', 0, 0, { setup: { outsider: 2 } }),
  R('imp', '小惡魔', 'demon', '每個夜晚*，你要選擇一名玩家：他死亡。如果你以這種方式自殺，一名爪牙會變成小惡魔。', 0, 24),
  // 黯月初升
  R('grandmother', '祖母', 'townsfolk', '在你的首個夜晚，你會得知一名善良玩家和他的角色。如果惡魔殺死了他，你也會死亡。', 40, 51),
  R('sailor', '水手', 'townsfolk', '每個夜晚，你要選擇一名存活的玩家：你或他之一會醉酒直到下個黃昏。你不會死亡。', 11, 4),
  R('chambermaid', '侍女', 'townsfolk', '每個夜晚，你要選擇除你以外的兩名存活的玩家：你會得知他們中有幾人在當晚因其自身能力而被喚醒。', 51, 70),
  R('exorcist', '驅魔人', 'townsfolk', '每個夜晚*，你要選擇一名玩家（與上個夜晚不同）：如果你選中了惡魔，他會得知你是驅魔人，但他當晚不會因其自身能力而被喚醒。', 0, 21),
  R('innkeeper', '旅店老闆', 'townsfolk', '每個夜晚*，你要選擇兩名玩家：他們當晚不會死亡，但其中一人會醉酒到下個黃昏。', 0, 9),
  R('gambler', '賭徒', 'townsfolk', '每個夜晚*，你要選擇一名玩家並猜測他的角色：如果你猜錯了，你會死亡。', 0, 10),
  R('gossip', '造謠者', 'townsfolk', '每個白天，你可以公開發表一個聲明。如果該聲明正確，在當晚會有一名玩家死亡。', 0, 38),
  R('courtier', '侍臣', 'townsfolk', '每局遊戲限一次，在夜晚時，你可以選擇一個角色：如果該角色在場，他從當晚開始醉酒三天三夜。', 19, 8, { once: true }),
  R('professor', '教授', 'townsfolk', '每局遊戲限一次，在夜晚時*，你可以選擇一名死亡的玩家：如果他是鎮民，你會令他復活。', 0, 43, { once: true }),
  R('minstrel', '吟遊詩人', 'townsfolk', '當一名爪牙死於處決時，除了你和旅行者以外的所有其他玩家醉酒直到明天黃昏。', 0, 0),
  R('tealady', '茶藝師', 'townsfolk', '如果與你鄰近的兩名存活的玩家是善良的，他們不會死亡。', 0, 0),
  R('pacifist', '和平主義者', 'townsfolk', '被處決的善良玩家可能不會死亡。', 0, 0),
  R('fool', '弄臣', 'townsfolk', '當你首次將要死亡時，你不會死亡。', 0, 0),
  R('tinker', '修補匠', 'outsider', '你隨時可能死亡。', 0, 0),
  R('moonchild', '月之子', 'outsider', '當你得知你死亡時，你要公開選擇一名存活的玩家。如果他是善良的，在當晚他會死亡。', 0, 50),
  R('goon', '莽夫', 'outsider', '每個夜晚，首個使用其自身能力選擇了你的玩家會醉酒直到下個黃昏。你會轉變爲他的陣營。', 0, 0),
  R('lunatic', '瘋子', 'outsider', '你以爲你是一個惡魔，但其實你不是。惡魔知道你是瘋子以及你在夜晚時選擇了哪些玩家。', 8, 20),
  R('godfather', '教父', 'minion', '在你的首個夜晚，你會得知有哪些外來者角色在場。如果有外來者在白天死亡，你會在當晚被喚醒並且你要選擇一名玩家：他死亡。[-1或+1外來者]', 21, 37, { setup: { outsider: [1, -1] } }),
  R('devilsadvocate', '魔鬼代言人', 'minion', '每個夜晚，你要選擇一名存活的玩家（與上個夜晚不同）：如果明天白天他被處決，他不會死亡。', 22, 13),
  R('assassin', '刺客', 'minion', '每局遊戲限一次，在夜晚時*，你可以選擇一名玩家：他死亡，即使因爲任何原因讓他不會死亡。', 0, 36, { once: true }),
  R('mastermind', '主謀', 'minion', '如果惡魔死於處決而因此導致遊戲結束時，再額外進行一個夜晚和一個白天。在那個白天如果有玩家被處決，他的陣營落敗。', 0, 0),
  R('zombuul', '僵怖', 'demon', '每個夜晚*，如果今天白天沒有人死亡，你會被喚醒並要選擇一名玩家：他死亡。當你首次死亡後，你仍存活，但會被當作死亡。', 0, 25),
  R('pukka', '普卡', 'demon', '每個夜晚，你要選擇一名玩家：他中毒。上個因你的能力中毒的玩家會死亡並恢復健康。', 28, 26),
  R('shabaloth', '沙巴洛斯', 'demon', '每個夜晚*，你要選擇兩名玩家：他們死亡。你上個夜晚選擇過且當前死亡的玩家之一可能會被你反芻。', 0, 27),
  R('po', '珀', 'demon', '每個夜晚*，你可以選擇一名玩家：他死亡。如果你上次選擇時沒有選擇任何玩家，當晚你要選擇三名玩家：他們死亡。', 0, 28),
  // 夢殞春宵
  R('clockmaker', '鐘錶匠', 'townsfolk', '在你的首個夜晚，你會得知惡魔與爪牙之間最近的距離。（鄰座的玩家距離爲1）', 41, 0),
  R('dreamer', '築夢師', 'townsfolk', '每個夜晚，你要選擇除你及旅行者以外的一名玩家：你會得知一個善良角色和一個邪惡角色，該玩家是其中一個角色。', 42, 56),
  R('snakecharmer', '舞蛇人', 'townsfolk', '每個夜晚，你要選擇一名存活的玩家：如果你選中了惡魔，你和他交換角色和陣營，然後他中毒。', 20, 11),
  R('mathematician', '數學家', 'townsfolk', '每個夜晚，你會得知有多少名玩家的能力因爲其他角色的能力而未正常生效。（從上個黎明到你被喚醒時）', 52, 71),
  R('flowergirl', '賣花女孩', 'townsfolk', '每個夜晚*，你會得知在今天白天時是否有惡魔投過票。', 0, 57),
  R('towncrier', '城鎮公告員', 'townsfolk', '每個夜晚*，你會得知在今天白天時是否有爪牙發起過提名。', 0, 58),
  R('oracle', '神諭者', 'townsfolk', '每個夜晚*，你會得知有多少名死亡的玩家是邪惡的。', 0, 59),
  R('savant', '博學者', 'townsfolk', '每個白天，你可以私下詢問說書人以得知兩條信息：一個是正確的，一個是錯誤的。', 0, 0),
  R('seamstress', '女裁縫', 'townsfolk', '每局遊戲限一次，在夜晚時，你可以選擇除你以外的兩名玩家：你會得知他們是否爲同一陣營。', 43, 60, { once: true }),
  R('philosopher', '哲學家', 'townsfolk', '每局遊戲限一次，在夜晚時，你可以選擇一個善良角色：你獲得該角色的能力。如果這個角色在場，他醉酒。', 2, 2, { once: true }),
  R('artist', '藝術家', 'townsfolk', '每局遊戲限一次，在白天時，你可以私下詢問說書人一個是非問題，你會得知該問題的答案。', 0, 0),
  R('juggler', '雜耍藝人', 'townsfolk', '在你的首個白天，你可以公開猜測任意玩家的角色最多五次。在當晚，你會得知猜測正確的角色數量。', 0, 61),
  R('sage', '賢者', 'townsfolk', '如果惡魔殺死了你，在當晚你會被喚醒並得知兩名玩家，其中一名是殺死你的那個惡魔。', 0, 42),
  R('mutant', '畸形秀演員', 'outsider', '如果你“瘋狂”地證明自己是外來者，你可能被處決。', 0, 0),
  R('sweetheart', '心上人', 'outsider', '當你死亡時，會有一名玩家開始醉酒。', 0, 0),
  R('barber', '理髮師', 'outsider', '如果你死亡，在當晚惡魔可以選擇兩名玩家（不能選擇其他惡魔）交換角色。', 0, 40),
  R('klutz', '呆瓜', 'outsider', '當你得知你死亡時，你要公開選擇一名存活的玩家：如果他是邪惡的，你的陣營落敗。', 0, 0),
  R('eviltwin', '鏡像雙子', 'minion', '你與一名對立陣營的玩家互相知道對方是什麼角色。如果其中善良玩家被處決，邪惡陣營獲勝。如果你們都存活，善良陣營無法獲勝。', 23, 0),
  R('witch', '女巫', 'minion', '每個夜晚，你要選擇一名玩家：如果他明天白天發起提名，他死亡。如果只有三名存活的玩家，你失去此能力。', 24, 14),
  R('cerenovus', '洗腦師', 'minion', '每個夜晚，你要選擇一名玩家和一個善良角色：他明天白天和夜晚需要“瘋狂”地證明自己是這個角色，不然他可能被處決。', 25, 15),
  R('pithag', '麻臉巫婆', 'minion', '每個夜晚*，你要選擇一名玩家和一個角色，如果該角色不在場，他變成該角色。如果因此創造了一個惡魔，當晚的死亡由說書人決定。', 0, 16),
  R('fanggu', '方古', 'demon', '每個夜晚*，你要選擇一名玩家：他死亡。被該能力殺死的外來者改爲變成邪惡的方古且你代替他死亡，但每局遊戲僅能成功轉化一次。[+1外來者]', 0, 29, { setup: { outsider: 1 } }),
  R('vigormortis', '亡骨魔', 'demon', '每個夜晚*，你要選擇一名玩家：他死亡。被你殺死的爪牙保留他的能力，且與他鄰近的兩名鎮民之一中毒。[-1外來者]', 0, 32, { setup: { outsider: -1 } }),
  R('nodashii', '諾-達鯴', 'demon', '每個夜晚*，你要選擇一名玩家：他死亡。與你鄰近的兩名鎮民中毒。', 0, 30),
  R('vortox', '渦流', 'demon', '每個夜晚*，你要選擇一名玩家：他死亡。鎮民玩家的能力都會產生錯誤信息。如果白天沒人被處決，邪惡陣營獲勝。', 0, 31),
].map(r => [r.id, r]));

export const SCRIPTS = {
  tb: {
    name: '暗流湧動',
    en: 'Trouble Brewing',
    roles: ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker',
      'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor', 'butler', 'drunk', 'recluse', 'saint',
      'poisoner', 'spy', 'scarletwoman', 'baron', 'imp'],
  },
  bmr: {
    name: '黯月初升',
    en: 'Bad Moon Rising',
    roles: ['grandmother', 'sailor', 'chambermaid', 'exorcist', 'innkeeper', 'gambler', 'gossip', 'courtier',
      'professor', 'minstrel', 'tealady', 'pacifist', 'fool', 'tinker', 'moonchild', 'goon', 'lunatic',
      'godfather', 'devilsadvocate', 'assassin', 'mastermind', 'zombuul', 'pukka', 'shabaloth', 'po'],
  },
  snv: {
    name: '夢殞春宵',
    en: 'Sects & Violets',
    roles: ['clockmaker', 'dreamer', 'snakecharmer', 'mathematician', 'flowergirl', 'towncrier', 'oracle', 'savant',
      'seamstress', 'philosopher', 'artist', 'juggler', 'sage', 'mutant', 'sweetheart', 'barber', 'klutz',
      'eviltwin', 'witch', 'cerenovus', 'pithag', 'fanggu', 'vigormortis', 'nodashii', 'vortox'],
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

// 某個角色讓外來者增減幾個：二選一的（教父 ±1）用 pick 指定的那個，沒指定時取第一個
export function outsiderShift(id, pick) {
  const x = ROLES[id]?.setup?.outsider || 0;
  return Array.isArray(x) ? (x.includes(pick) ? pick : x[0]) : x;
}
// 本局各類角色的數量（男爵、教父、方古、亡骨魔會改變配置）；picks：二選一的角色 -> 說書人選的增減
export function teamCounts(n, setupRoles = [], picks = {}) {
  const [townsfolk, outsider, minion, demon] = distribution(n);
  const c = { townsfolk, outsider, minion, demon };
  for (const id of setupRoles) {
    const x = Math.max(-c.outsider, Math.min(outsiderShift(id, picks[id]), c.townsfolk)); // 外來者不能減成負數
    c.townsfolk -= x; c.outsider += x;
  }
  return c;
}
export const changesSetup = id => !!ROLES[id]?.setup;

// 配置里沒有外來者時，隨機抽取默認排除和外來者相關的鎮民（說書人設為必選則仍會出現）
export const skippedForNoOutsider = (id, c) => !!ROLES[id]?.needsOutsider && c.outsider === 0;

export const isEvilRole = id => !!ROLES[id] && !TEAMS[ROLES[id].team].good;
