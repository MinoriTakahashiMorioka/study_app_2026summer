/**
 * アプリの起動処理。
 * 「どのURLでどの画面を出すか」と「ログインしていないときはどうするか」をここで決めます。
 */
import { auth } from './core/auth.js';
import { router } from './core/router.js';
import { renderLogin } from './screens/login.js';
import { renderSignup } from './screens/signup.js';
import { renderHub } from './screens/hub.js';
import { renderFeature } from './screens/feature-shell.js';

const root = document.getElementById('app');

// 1. 前回のログイン状態を復元
auth.restore();

// 2. ログインしていなければログイン画面へ、ログイン済みならログイン・新規登録画面は飛ばす
const PUBLIC_PATHS = ['/login', '/signup'];
router.setGuard((path) => {
  const isPublic = PUBLIC_PATHS.includes(path);
  if (!auth.isLoggedIn && !isPublic) return '/login';
  if (auth.isLoggedIn && isPublic) return '/hub';
  return null;
});

// 3. URL と画面の対応表
router.add(/^\/login$/, () => renderLogin(root));
router.add(/^\/signup$/, () => renderSignup(root));
router.add(/^\/hub$/, () => renderHub(root));
// 機能の中の画面は #/app/<機能ID>/<その先> （例: #/app/profile/goals/abc123）
router.add(/^\/app\/([a-z0-9-]+)(?:\/([a-z0-9/_-]*))?$/, (id, sub) => renderFeature(root, id, sub ?? ''));

// 4. ログイン・ログアウトしたら画面を切り替える（戻るボタンでログイン画面に戻らないよう replace）
auth.onChange(() => {
  router.navigate(auth.isLoggedIn ? '/hub' : '/login', { replace: true });
});

router.start('/hub');
