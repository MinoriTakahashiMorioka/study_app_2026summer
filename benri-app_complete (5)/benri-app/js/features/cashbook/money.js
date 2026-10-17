/** 金額の読み取りと表示 */

export const MAX_AMOUNT = 999_999_999;

/**
 * 入力された金額を数値にする。空なら null。
 * 「1,200」「￥1200」「１２００円」なども読める。
 */
export function parseAmount(text) {
  const value = String(text ?? '').normalize('NFKC').replace(/[¥￥,，円\s]/g, '');
  if (!value) return null;
  if (!/^\d+$/.test(value)) throw new Error('金額は数字で入力してください（例: 1200）。');
  const n = Number(value);
  if (n > MAX_AMOUNT) throw new Error('金額が大きすぎます。');
  return n;
}

/** 1200 → '1,200' */
export const yen = (n) => (n == null ? '' : Math.abs(n).toLocaleString('ja-JP'));

/** 残高の表示（マイナスは「−」をつける） */
export const balanceText = (n) => `${n < 0 ? '−' : ''}${yen(n)}`;

/** 'YYYY-MM-DD' → '10/15' */
export const shortDate = (key) => {
  if (!key) return '';
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
};
