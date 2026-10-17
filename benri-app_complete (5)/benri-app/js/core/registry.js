/**
 * アプリに登録されている機能の一覧。ハブ画面はこの配列を並べるだけです。
 *
 * ✅ 新しい機能を追加する手順
 *   1. js/features/<名前>/index.js を作って defineFeature({...}) を書く
 *   2. 下で import して FEATURES に1行足す ← ハブやログイン画面の修正は不要
 */
import calendar from '../features/calendar/index.js';
import study from '../features/study/index.js';
import profile from '../features/profile/index.js';
import routine from '../features/routine/index.js';
import diary from '../features/diary/index.js';
import cashbook from '../features/cashbook/index.js';

export const FEATURES = [
  routine,
  calendar,
  study,
  profile,
  diary,
  cashbook,
  // memo,      ← 例: 将来ここに足していく
];

export function getFeature(id) {
  return FEATURES.find((feature) => feature.id === id) ?? null;
}
