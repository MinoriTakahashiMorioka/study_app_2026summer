import { auth } from './auth.js';
import { router } from './router.js';
import { createStore } from './storage.js';

/**
 * 機能に渡す「道具箱」を作る。
 * 保存領域はユーザーID＋機能IDで分けるので、
 * demo さんのカレンダーと admin さんのカレンダーは混ざりません。
 *
 * @returns {import('./feature.js').FeatureContext}
 */
export function makeContext(feature) {
  const user = auth.user;
  return {
    user,
    store: createStore(`u:${user.id}:${feature.id}`),
    navigate: router.navigate,
  };
}
