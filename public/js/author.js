// 作者署名、社交賬號、投喂方式：「關於」面板（about.js）讀這裏。空著的項目顯示成虛線佔位，填上就生效
export const AUTHOR = {
  name: 'LyLy', // 署名
  seal: '', // 名章上的字（一兩個字）；空著取署名的第一個字
  // 社交賬號：有 url 點了打開；只有 handle（QQ 群號、公眾號名）點了複製
  links: [
    { name: '小紅書', handle: '', url: 'https://xhslink.com/m/5eztlZdkuN3' },
  ],
  // 投喂：img 是收款碼圖片（放 public/img/tip/，寫 'img/tip/reward.webp' 這樣的路徑），或者 url 是愛發電這類頁面
  tip: [
    { name: '微信', img: 'img/tip/reward.webp' },
  ],
  repo: 'https://github.com/on9dra/clocktower-online',
};
