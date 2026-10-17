/**
 * 一日のルーティン：定数と時間の計算。
 */

/** 予定の種類（色分け） */
export const CATEGORIES = [
  { id: 'sleep', name: '睡眠', color: '#5B6CC2' },
  { id: 'care', name: '身支度・家事', color: '#1A8C99' },
  { id: 'meal', name: '食事', color: '#D9822B' },
  { id: 'school', name: '学校・仕事', color: '#2F6FD6' },
  { id: 'study', name: '勉強', color: '#7A4FC9' },
  { id: 'exercise', name: '運動', color: '#2E9B5F' },
  { id: 'move', name: '移動', color: '#8A9A1F' },
  { id: 'free', name: '自由時間', color: '#C2408A' },
  { id: 'other', name: 'その他', color: '#6B7A73' },
];
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

/** Todo の時間帯 */
export const SLOTS = [
  { id: 'morning', name: '朝', hint: '〜11時', from: 4, to: 11 },
  { id: 'noon', name: '昼', hint: '11〜17時', from: 11, to: 17 },
  { id: 'night', name: '夜', hint: '17時〜', from: 17, to: 28 },
  { id: 'anytime', name: 'いつでも', hint: '時間帯なし', from: null, to: null },
];
export const slotOf = (id) => SLOTS.find((s) => s.id === id) ?? SLOTS[3];

/** 今の時刻の時間帯（深夜 0〜4時は「夜」扱い） */
export function currentSlot(date = new Date()) {
  const hour = date.getHours();
  const h = hour < 4 ? hour + 24 : hour;
  return SLOTS.find((s) => s.from != null && h >= s.from && h < s.to)?.id ?? 'anytime';
}

/** 'HH:MM' → 分 */
export const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** 分 → 'H:MM' */
export const formatTime = (minutes) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** 開始〜終了の長さ（分）。終了が開始より前なら日付をまたぐとみなす */
export function durationOf(block) {
  const s = toMinutes(block.start);
  const e = toMinutes(block.end);
  return e > s ? e - s : e + 1440 - s;
}

/** 75 → '1時間15分' */
export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

/** いまの分（0〜1439） */
export const nowMinutes = (date = new Date()) => date.getHours() * 60 + date.getMinutes();

/**
 * ブロックを 0〜1440 分の区間に分ける（日付をまたぐものは2つに分割）
 * @returns {{ block, from: number, to: number, part: 'whole' | 'head' | 'tail' }[]}
 */
export function segmentsOf(blocks) {
  const segments = [];
  for (const block of blocks) {
    const s = toMinutes(block.start);
    const e = toMinutes(block.end);
    if (e > s) segments.push({ block, from: s, to: e, part: 'whole' });
    else {
      segments.push({ block, from: s, to: 1440, part: 'head' });  // 夜の部分
      if (e > 0) segments.push({ block, from: 0, to: e, part: 'tail' }); // 翌朝（前日から続く部分）
    }
  }
  return segments.sort((a, b) => a.from - b.from || b.to - a.to);
}

/** 重なっている予定を横に並べるための列（lane）を決める */
export function layoutLanes(segments) {
  const result = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanesEnd = [];
    for (const seg of cluster) {
      let lane = lanesEnd.findIndex((end) => end <= seg.from);
      if (lane < 0) { lane = lanesEnd.length; lanesEnd.push(seg.to); } else lanesEnd[lane] = seg.to;
      seg.lane = lane;
    }
    for (const seg of cluster) { seg.lanes = lanesEnd.length; result.push(seg); }
    cluster = [];
  };

  for (const seg of segments) {
    if (cluster.length && seg.from >= clusterEnd) flush();
    cluster.push({ ...seg });
    clusterEnd = Math.max(clusterEnd, seg.to);
    if (cluster.length === 1) clusterEnd = seg.to;
  }
  if (cluster.length) flush();
  return result;
}

/** 指定した分に行っている予定（日付またぎも考慮） */
export function blockAt(blocks, minute) {
  return segmentsOf(blocks).find((seg) => minute >= seg.from && minute < seg.to)?.block ?? null;
}

/** 指定した分より後に始まる、いちばん近い予定 */
export function nextBlock(blocks, minute) {
  return [...blocks]
    .map((b) => ({ b, start: toMinutes(b.start) }))
    .filter(({ start }) => start > minute)
    .sort((a, b) => a.start - b.start)[0]?.b ?? null;
}

/** 予定が終わるまでの残り分 */
export function minutesLeft(block, minute) {
  const s = toMinutes(block.start);
  const e = toMinutes(block.end);
  if (e > s) return e - minute;
  return minute >= s ? e + 1440 - minute : e - minute;
}
