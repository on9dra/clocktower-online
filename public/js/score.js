// 積分、MVP、雞蛋的數值：前後端共用（服務端結算，客戶端演出裏顯示 +N）
export const EGG = { start: 3, win: 10, lose: 1, mvp: 5 }; // 第一次進房間 / 勝利 / 失敗 / 當選 MVP
export const EGG_GAP = 600; // 同一個人兩次扔雞蛋至少隔這麼久（毫秒）
export const MVP_DELAY = 9000; // 終局演出播完才開始 MVP 投票
export const MVP_WINDOW = 30 * 1000; // MVP 投票時長
