import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { defineFeature } from '../../core/feature.js';
import { toDateKey } from '../../models/schema.js';
import { createResumeRepo } from './resume-repo.js';
import { mountResumeView } from './resume-view.js';
import { mountResumeEdit } from './resume-edit.js';
import { createGoalsRepo, deadlineStatus } from './goals-repo.js';
import { mountGoalsList } from './goals-list.js';
import { mountGoalDetail } from './goal-detail.js';

/**
 * 個人情報機能
 *
 *   index.js         … ハブに出す情報、中の項目（履歴書・目標）の切り替え（このファイル）
 *   era.js           … 和暦・日付の表示
 *   resume-repo.js   … 履歴書のデータ・写真の切り抜き
 *   resume-view.js   … 履歴書の表示（用紙風）
 *   resume-edit.js   … 履歴書の編集
 *   goals-repo.js    … 目標のデータ
 *   goals-list.js    … 目標／完了済みの一覧
 *   goal-detail.js   … 目標の詳細（達成率・条件・ロードマップ・完了）
 *   goal-sheet.js    … 目標・ステップの入力シート
 *
 * 画面のURL
 *   #/app/profile/resume        履歴書
 *   #/app/profile/resume/edit   履歴書の編集
 *   #/app/profile/goals         目標（取り組み中）
 *   #/app/profile/goals/done    完了済み
 *   #/app/profile/goals/<ID>    目標の詳細
 */

/**
 * 「個人情報」の中に並ぶ項目。
 * ✅ 項目を増やすときは、ここに1つ足して mount を書くだけです（例: 職務経歴書、健康記録など）。
 */
const SECTIONS = [
  {
    id: 'resume',
    label: '履歴書',
    icon: 'doc',
    mount(panel, { ctx, rest }) {
      const repo = createResumeRepo(ctx.store);
      if (rest[0] === 'edit') return mountResumeEdit(panel, { repo, go: ctx.go, back: ctx.back });
      return mountResumeView(panel, { repo, go: ctx.go });
    },
  },
  {
    id: 'goals',
    label: '目標',
    icon: 'flag',
    mount(panel, { ctx, rest }) {
      const repo = createGoalsRepo(ctx.store);
      if (!rest[0]) return mountGoalsList(panel, { repo, go: ctx.go, tab: 'active' });
      if (rest[0] === 'done') return mountGoalsList(panel, { repo, go: ctx.go, tab: 'done' });
      return mountGoalDetail(panel, { repo, go: ctx.go, back: ctx.back, goalId: rest[0] });
    },
  },
];

/** demo アカウントにだけ、試しやすいサンプルを入れる（初回のみ）。自分用なら消してかまいません */
function seedDemo(ctx) {
  if (ctx.user.id !== 'demo' || ctx.store.get('demoSeeded', false)) return;
  ctx.store.set('demoSeeded', true);

  const resume = createResumeRepo(ctx.store);
  if (!resume.hasData()) {
    resume.seedSample({
      updatedOn: toDateKey(),
      name: '山田 花子',
      nameKana: 'やまだ はなこ',
      birthDate: '2004-04-02',
      postalCode: '123-4567',
      address: '東京都〇〇区△△町1-2-3 サンプルハイツ101',
      addressKana: 'とうきょうと〇〇く△△ちょう',
      phone: '03-0000-0000',
      mobile: '090-0000-0000',
      history: [
        { id: 'h1', year: 2020, month: 4, kind: '学歴', text: 'さくら高等学校 普通科 入学' },
        { id: 'h2', year: 2023, month: 3, kind: '学歴', text: 'さくら高等学校 普通科 卒業' },
        { id: 'h3', year: 2023, month: 4, kind: '学歴', text: 'みなと大学 経済学部 経済学科 入学' },
        { id: 'h4', year: 2027, month: 3, kind: '学歴', text: 'みなと大学 経済学部 経済学科 卒業見込み' },
      ],
      licenses: [
        { id: 'l1', year: 2023, month: 8, kind: '免許', name: '普通自動車第一種運転免許 取得' },
        { id: 'l2', year: 2024, month: 6, kind: '資格', name: 'TOEIC Listening & Reading Test 780点 取得' },
        { id: 'l3', year: 2025, month: 2, kind: '資格', name: '日商簿記検定試験 2級 合格' },
      ],
    });
  }

  const goals = createGoalsRepo(ctx.store);
  if (goals.all().length === 0) {
    const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return toDateKey(d); };
    const ago = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); };

    const toeic = goals.add({ title: 'TOEIC 860点を取る', kind: 'deadline', deadline: shift(150), createdAt: ago(40) });
    const m1 = goals.addMilestone(toeic.id, { text: '公式問題集を1冊解き終える', due: shift(-5) });
    goals.addMilestone(toeic.id, { text: '模試で750点以上', due: shift(40) });
    goals.addMilestone(toeic.id, { text: '模試で820点以上（ここを超えれば本番860点がねらえる）', due: shift(110) });
    goals.addMilestone(toeic.id, { text: '本番の申し込みをする', due: shift(90) });
    goals.toggleMilestone(toeic.id, m1.id);
    goals.patch(toeic.id, { conditions: '本番の1か月前の模試で820点を超えていれば、860点に届く可能性が高い。\nリスニングのPart 3・4で8割を取れるようにする。' });

    goals.add({ title: '日商簿記1級に合格する', kind: 'deadline', deadline: shift(400), createdAt: ago(10) });

    const travel = goals.add({ title: '47都道府県すべてに行く', kind: 'lifetime', createdAt: ago(300), description: '行った県はメモに書いていく' });
    goals.patch(travel.id, { progressMode: 'manual', manualProgress: 30, conditions: '今のところ14都道府県。長期休みごとに2県ずつ増やす。' });
    goals.add({ title: 'フルマラソンを完走する', kind: 'lifetime', createdAt: ago(120) });

    const license = goals.add({ title: '普通自動車免許を取る', kind: 'deadline', deadline: '2023-08-31', createdAt: '2023-05-10T09:00:00+09:00' });
    goals.addMilestone(license.id, { text: '仮免許に合格', due: '2023-07-15' });
    goals.toggleMilestone(license.id, goals.get(license.id).milestones[0].id);
    goals.complete(license.id);
    const all = goals.all();
    all.find((g) => g.id === license.id).completedAt = '2023-08-21T15:00:00+09:00';
    ctx.store.set('goals', all);
  }
}

export default defineFeature({
  id: 'profile',
  title: '個人情報',
  subtitle: '履歴書・目標',
  icon: 'idcard',
  color: '#B4417E',
  keywords: ['履歴書', '目標', 'プロフィール', '資格', '学歴', '職歴', 'ロードマップ', 'りれきしょ'],

  summary(ctx) {
    seedDemo(ctx);
    const goals = createGoalsRepo(ctx.store);
    const { withDeadline, lifetime } = goals.active();
    const count = withDeadline.length + lifetime.length;
    if (withDeadline[0]) return `目標 ${count}件・直近の期限 ${deadlineStatus(withDeadline[0].deadline).text}`;
    return count ? `目標 ${count}件` : '履歴書と目標を管理';
  },

  mount(root, ctx) {
    seedDemo(ctx);

    const [first, ...rest] = (ctx.subpath || '').split('/').filter(Boolean);
    const lastSection = ctx.store.get('pref.section', 'resume');
    const section = SECTIONS.find((s) => s.id === first) ?? SECTIONS.find((s) => s.id === lastSection) ?? SECTIONS[0];
    if (section.id !== first) {
      // #/app/profile だけで開いたときは、前回の項目の URL に置き換える（描画が終わってから）
      queueMicrotask(() => ctx.go(section.id, { replace: true }));
      return () => {};
    }
    ctx.store.set('pref.section', section.id);

    const panel = h('section', { class: 'profile-panel', role: 'tabpanel', 'aria-labelledby': `profile-tab-${section.id}` });

    root.append(h('div', { class: 'profile' },
      h('div', { class: 'tabs profile-tabs', role: 'tablist', 'aria-label': '個人情報の項目' },
        SECTIONS.map((s) => h('button', {
          type: 'button',
          role: 'tab',
          id: `profile-tab-${s.id}`,
          class: 'tab',
          'aria-selected': String(s.id === section.id),
          tabIndex: s.id === section.id ? 0 : -1,
          onClick: () => { if (s.id !== section.id || rest.length) ctx.go(s.id); },
        }, icon(s.icon), h('span', {}, s.label)))),
      panel,
    ));

    return section.mount(panel, { ctx, rest });
  },
});
