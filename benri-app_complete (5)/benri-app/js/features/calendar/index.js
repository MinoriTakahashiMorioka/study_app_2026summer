import { defineFeature } from '../../core/feature.js';
import { toDateKey } from '../../models/schema.js';
import { createCalendarRepo } from './repo.js';
import { addDays } from './dates.js';
import { mountCalendarView } from './view.js';

/**
 * カレンダー機能
 *
 *   index.js        … ハブに出す情報と入口（このファイル）
 *   repo.js         … データの読み書き・入力チェック
 *   dates.js        … 日付計算・日本の祝日
 *   view.js         … 月表示＋その日の予定一覧
 *   event-sheet.js  … 予定の追加・編集シート
 *   label-sheet.js  … ラベルの管理シート
 */

/**
 * お試し用の demo アカウントにだけ、操作を試せるサンプル予定を入れる（初回のみ）。
 * 自分のアカウントを作ったら、この関数ごと消してかまいません。
 */
function seedDemoEvents(ctx, repo) {
  if (ctx.user.id !== 'demo' || ctx.store.get('demoSeeded', false)) return;
  ctx.store.set('demoSeeded', true);
  if (repo.events().length > 0) return;

  const today = toDateKey();
  const samples = [
    { title: 'チーム定例', date: today, time: '10:00', labelId: 'work', memo: '先週の振り返りと今週の分担決め' },
    { title: 'ジム', date: today, time: '19:30', labelId: 'private', memo: '' },
    { title: '英語の小テスト', date: addDays(today, 2), time: null, labelId: 'study', memo: '範囲: Unit 5〜6\n単語帳 p.40〜52' },
    { title: '歯医者', date: addDays(today, 4), time: '14:00', labelId: 'important', memo: '保険証を持っていく' },
    { title: '読書会', date: addDays(today, -3), time: '18:00', labelId: 'private', memo: '' },
  ];
  for (const event of samples) repo.saveEvent(event);
}

export default defineFeature({
  id: 'calendar',
  title: 'カレンダー',
  subtitle: '予定をラベルで整理',
  icon: 'calendar',
  color: '#DB5A35',
  keywords: ['予定', 'スケジュール', 'ラベル', 'よてい', '祝日'],

  summary(ctx) {
    const repo = createCalendarRepo(ctx.store);
    seedDemoEvents(ctx, repo);
    const events = repo.eventsOn(toDateKey());
    if (events.length === 0) return '今日の予定はありません';
    const next = events.find((e) => e.time && e.time >= new Date().toTimeString().slice(0, 5));
    return next ? `今日 ${events.length}件・次は ${next.time}` : `今日の予定 ${events.length}件`;
  },

  mount(root, ctx) {
    const repo = createCalendarRepo(ctx.store);
    seedDemoEvents(ctx, repo);
    return mountCalendarView(root, { repo, toolbar: ctx.toolbar });
  },
});
