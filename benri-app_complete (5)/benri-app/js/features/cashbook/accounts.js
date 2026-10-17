/**
 * 勘定科目（お金の出入りを分類するための名前）。
 * 個人・家計で使いやすいものを用意しています。増やすときはここに1つ足すだけです。
 *
 * kind: 'income' = 入金の科目 / 'expense' = 出金の科目 / 'transfer' = お金の置き場所が変わるだけ（預金の出し入れ）
 */
export const ACCOUNTS = [
  // ----- 入金 -----
  { id: 'salary', name: '給料', kind: 'income', desc: 'アルバイト代・給与など、働いて受け取ったお金。', examples: 'バイト代、給与、ボーナス' },
  { id: 'allowance', name: '小遣い・仕送り', kind: 'income', desc: '家族などから定期的に受け取るお金。', examples: 'お小遣い、仕送り、お年玉' },
  { id: 'sales', name: '売上', kind: 'income', desc: '物を売ったり、作品やサービスを提供したりして得たお金。', examples: 'フリマアプリで売った、ハンドメイド作品の販売' },
  { id: 'misc-income', name: '雑収入', kind: 'income', desc: 'ほかに当てはまらない、臨時の収入。', examples: 'お祝い金、ポイントの現金化、返金、謝礼' },

  // ----- 出金 -----
  { id: 'food', name: '食費', kind: 'expense', desc: '食べ物・飲み物に使ったお金。外食やおやつも含めます。', examples: '昼ごはん、スーパーの食材、カフェ、お菓子' },
  { id: 'daily', name: '日用品費', kind: 'expense', desc: 'すぐ使い切る生活用品や文房具。', examples: 'ティッシュ、洗剤、シャンプー、ノート、ペン' },
  { id: 'transport', name: '交通費', kind: 'expense', desc: '移動にかかったお金。', examples: '電車・バス、タクシー、ガソリン、駐輪場' },
  { id: 'communication', name: '通信費', kind: 'expense', desc: '連絡やインターネットにかかるお金。', examples: 'スマホ代、インターネット代、切手、はがき' },
  { id: 'utilities', name: '水道光熱費', kind: 'expense', desc: '電気・ガス・水道の料金。', examples: '電気代、ガス代、水道代' },
  { id: 'housing', name: '住居費', kind: 'expense', desc: '住まいにかかるお金。', examples: '家賃、管理費、更新料' },
  { id: 'education', name: '教育費', kind: 'expense', desc: '学ぶためのお金。', examples: '参考書、教科書、授業料、塾・習い事、検定の受験料' },
  { id: 'social', name: '交際費', kind: 'expense', desc: '人づきあいのためのお金。', examples: 'プレゼント、お祝い、友だちとの食事会' },
  { id: 'entertainment', name: '娯楽費', kind: 'expense', desc: '趣味や楽しみのためのお金。', examples: 'ゲーム、映画、本・マンガ、旅行、サブスク' },
  { id: 'clothing', name: '被服費', kind: 'expense', desc: '身につけるものや身だしなみ。', examples: '服、靴、美容院、クリーニング' },
  { id: 'medical', name: '医療費', kind: 'expense', desc: '病気やけが・健康のためのお金。', examples: '病院、薬、歯医者、メガネ' },
  { id: 'insurance', name: '保険料', kind: 'expense', desc: '毎月・毎年はらう保険のお金。', examples: '生命保険、医療保険、自転車保険' },
  { id: 'misc-expense', name: '雑費', kind: 'expense', desc: 'ほかに当てはまらない、少額の支出。', examples: '手数料、ちょっとした寄付、コインロッカー' },

  // ----- 置き場所が変わるだけ -----
  { id: 'withdraw', name: '預金引出', kind: 'transfer', direction: 'income', desc: '銀行口座から引き出して手元に入れたお金。手元のお金は増えますが、持っているお金の合計は変わりません。', examples: 'ATMで引き出した' },
  { id: 'deposit', name: '預金預入', kind: 'transfer', direction: 'expense', desc: '手元のお金を銀行口座に預けた。手元のお金は減りますが、持っているお金の合計は変わりません。', examples: 'ATMで預けた、貯金した' },
];

export const GROUPS = [
  { kind: 'income', label: '入金の科目' },
  { kind: 'expense', label: '出金の科目' },
  { kind: 'transfer', label: '預金の出し入れ' },
];

export const accountOf = (id) => ACCOUNTS.find((a) => a.id === id) ?? null;

/** その科目は入金側か出金側か（入力欄の自動移動に使う） */
export const sideOf = (id) => {
  const a = accountOf(id);
  if (!a) return null;
  return a.kind === 'transfer' ? a.direction : a.kind;
};
