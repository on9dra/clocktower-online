// 機器人玩家：加入指定房間，夜晚隨機選目標，投票時隨機舉手。用法：node tests/bots.js 房間號 [人數]
import { io } from 'socket.io-client';
const [code, count = 6] = process.argv.slice(2);
const names = ['小明', '阿紫', '老王', 'Lily', '大熊', '七七', '阿杰', '豆豆', '小魚', '木木'];
for (let i = 0; i < Number(count); i++) {
  const s = io(process.env.URL || 'http://localhost:3000', { forceNew: true });
  let lastStep = null, lastNom = null;
  s.on('connect', () => s.emit('pl:join', { code, pid: 'bot-' + code + '-' + i, name: names[i] }, r => r.ok || console.log(r.error)));
  s.on('state', st => {
    if (st.prompt && st.prompt.stepId !== lastStep) {
      lastStep = st.prompt.stepId;
      const pool = st.seats.filter(x => !(st.prompt.notSelf && x.id === st.myId)).map(x => x.id).sort(() => Math.random() - 0.5);
      setTimeout(() => s.emit('pl:act', { act: 'pick', ids: pool.slice(0, st.prompt.count) }, () => {}), 1500);
    }
    const nom = st.nomination;
    if (nom && nom.at !== lastNom) {
      lastNom = nom.at;
      if (Math.random() < 0.6) setTimeout(() => s.emit('pl:act', { act: 'vote', up: true }, () => {}), 800 + Math.random() * 1500);
    }
  });
}
