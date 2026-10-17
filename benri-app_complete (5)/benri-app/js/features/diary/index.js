import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { defineFeature } from '../../core/feature.js';
import { showToast } from '../../core/toast.js';
import { toDateKey } from '../../models/schema.js';
import { createDiaryRepo } from './repo.js';
import { addDays, isDateKey, isMonthKey, monthOf, weekStart } from './dates.js';
import { openDiaryEditor } from './editor.js';
import { mountDayView, mountFavoritesView, mountMonthView, mountWeekView } from './views.js';

/**
 * 日記機能
 *
 *   index.js   … ハブに出す情報、表示の切り替え（このファイル）
 *   repo.js    … 日記のデータ（1日1件、文字数の制限）
 *   dates.js   … 日付の計算（週は月曜はじまり）
 *   parts.js   … ♡・カード・文字数カウンターなどの部品
 *   editor.js  … 書く・直すシート
 *   views.js   … 日・週・月・お気に入りの表示
 *
 * 画面のURL
 *   #/app/diary/day/2026-10-15    日ごと
 *   #/app/diary/week/2026-10-12   週ごと（月曜日の日付）
 *   #/app/diary/month/2026-10     月ごと
 *   #/app/diary/favorites         お気に入り
 */

const VIEWS = [
  { id: 'day', label: '日', icon: 'book2' },
  { id: 'week', label: '週', icon: 'list' },
  { id: 'month', label: '月', icon: 'calendar' },
  { id: 'favorites', label: 'お気に入り', icon: 'starFill' },
];

/** demo アカウントにだけサンプルの日記を入れる（初回のみ） */
function seedDemo(ctx, repo) {
  if (ctx.user.id !== 'demo' || ctx.store.get('demoSeeded', false)) return;
  ctx.store.set('demoSeeded', true);
  if (repo.count() > 0) return;
  const today = toDateKey();
  const samples = [
    [-1, 4, false, '部活のあと、友だちとラーメンを食べに行った。久しぶりにゆっくり話せて楽しかった。帰ってから英単語を30個覚えた。', '寝る前のスマホが長かった。23時には置く。'],
    [-2, 3, false, '朝から雨。数学の小テストは思ったよりできなかった。図形の問題で時間を使いすぎた。', '時間配分を決めてから解く。'],
    [-3, 5, true, '英語の発表がうまくいった！先生にもほめられた。練習を3回したのがよかったと思う。今日はよく眠れそう。', ''],
    [-5, 2, false, '寝坊して朝ごはんを食べられなかった。一日じゅう集中できなかった。', 'アラームを2つかける。前の日の準備を早めにする。'],
    [-6, 4, false, '家族で買い物に行った。新しいノートとペンを買ったので、明日から勉強が楽しみ。', ''],
    [-8, 3, false, '特に何もない日。動画を見すぎた気がする。', '見る時間を決める。'],
    [-10, 5, true, '友だちの誕生日会。サプライズが成功してみんなで大笑いした。準備をがんばってよかった。', ''],
    [-13, 4, false, '図書館で3時間勉強できた。静かな場所だと集中できると分かった。', '週末は図書館に行く。'],
    [-15, 3, false, 'テスト勉強を始めた。範囲が広くて少しあせっている。', '計画を立ててから始める。'],
    [-20, 4, false, '久しぶりにランニング。5km走れた。体を動かすと気分がいい。', ''],
  ];
  for (const [offset, rating, favorite, text, reflection] of samples) {
    repo.save({ date: addDays(today, offset), rating, favorite, text, reflection });
  }
}

export default defineFeature({
  id: 'diary',
  title: '日記',
  subtitle: '毎日の記録・♡と☆',
  icon: 'book2',
  color: '#8B5E34',
  keywords: ['日記', 'にっき', 'ダイアリー', '記録', '振り返り', '反省', 'お気に入り'],

  summary(ctx) {
    const repo = createDiaryRepo(ctx.store);
    seedDemo(ctx, repo);
    const entry = repo.get(toDateKey());
    const streak = repo.streak();
    const head = entry ? `今日 ♡${entry.rating ?? '–'}${entry.favorite ? ' ☆' : ''}` : '今日はまだ書いていません';
    return streak > 1 ? `${head}・${streak}日連続` : head;
  },

  mount(root, ctx) {
    const repo = createDiaryRepo(ctx.store);
    seedDemo(ctx, repo);
    const today = toDateKey();

    // ---------- URL から表示を決める ----------
    const [viewId, param] = (ctx.subpath || '').split('/');
    const view = VIEWS.find((v) => v.id === viewId);
    if (!view) {
      const last = repo.pref('view', 'day');
      const fallback = { day: `day/${today}`, week: `week/${weekStart(today)}`, month: `month/${monthOf(today)}`, favorites: 'favorites' }[last] ?? `day/${today}`;
      queueMicrotask(() => ctx.go(fallback, { replace: true }));
      return () => {};
    }
    repo.setPref('view', view.id);

    const go = ctx.go;
    /** 書く（その日の日記があれば直す） */
    const write = (date = today) => openDiaryEditor({
      repo,
      date,
      onSaved: (entry) => {
        showToast(`${entry.date === today ? '今日' : entry.date.slice(5).replace('-', '/')}の日記を保存しました`);
        if (view.id === 'day' && entry.date !== param) go(`day/${entry.date}`, { replace: true });
      },
      onDeleted: () => showToast('日記を削除しました'),
    });

    // 上部バーの右に「書く」ボタン
    const writeBtn = h('button', { type: 'button', class: 'tool-btn', onClick: () => write(view.id === 'day' && isDateKey(param) && param <= today ? param : today) },
      icon('pencil'), '書く');
    ctx.toolbar?.append(writeBtn);

    // ---------- 表示の切り替え（日・週・月・お気に入り） ----------
    const tabs = h('div', { class: 'tabs diary-tabs', role: 'tablist', 'aria-label': '日記の表示' },
      VIEWS.map((v) => h('button', {
        type: 'button',
        role: 'tab',
        class: 'tab',
        'aria-selected': String(v.id === view.id),
        tabIndex: v.id === view.id ? 0 : -1,
        onClick: () => {
          if (v.id === view.id) return;
          const anchor = isDateKey(param) ? param : isMonthKey(param) ? `${param}-01` : today;
          const sub = { day: `day/${anchor > today ? today : anchor}`, week: `week/${weekStart(anchor)}`, month: `month/${monthOf(anchor)}`, favorites: 'favorites' }[v.id];
          go(sub, { replace: true });
        },
      }, icon(v.icon), h('span', {}, v.label))));

    const panel = h('section', { class: 'diary-panel', role: 'tabpanel' });
    root.append(h('div', { class: 'diary' }, tabs, panel));

    const deps = { repo, go, write };
    if (view.id === 'day') return mountDayView(panel, { ...deps, date: isDateKey(param) ? param : today });
    if (view.id === 'week') return mountWeekView(panel, { ...deps, monday: weekStart(isDateKey(param) ? param : today) });
    if (view.id === 'month') return mountMonthView(panel, { ...deps, month: isMonthKey(param) ? param : monthOf(today) });
    return mountFavoritesView(panel, deps);
  },
});
