/**
 * ポモドーロタイマーの中身（画面とは分けてある）。
 *
 * 「終わる時刻（endsAt）」を保存して残り時間を毎回計算するので、
 *   - 別のタブや画面に移っても時間は進み続ける
 *   - ページを再読み込みしても続きから再開できる
 *   - スマホがスリープして setInterval が止まってもずれない
 *
 * 状態（phase）
 *   idle     … 待機中（時間を選べる）
 *   running  … 作動中
 *   paused   … 一時停止中
 *   finished … 時間切れ（記録済み）
 *
 * 種類（kind）: 'focus' = 集中（終わると記録される） / 'break' = 休憩（記録しない）
 */

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 180;
export const BREAK_MINUTES = 5;

/** @param {ReturnType<import('../../core/storage.js').createStore>} store */
export function createTimer(store) {
  const lastMinutes = () => store.get('lastMinutes', 25);

  const idleState = (minutes, kind = 'focus', subject = '') => ({
    phase: 'idle',
    kind,
    plannedSec: minutes * 60,
    remainingSec: minutes * 60,
    endsAt: null,
    startedAt: null,
    subject,
  });

  const read = () => store.get('timer', null) ?? idleState(lastMinutes());
  const write = (state) => store.set('timer', state);

  const remainingOf = (state) => (state.phase === 'running'
    ? Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000))
    : state.remainingSec);

  const clampMinutes = (value) => {
    const minutes = Math.round(Number(value));
    if (!Number.isFinite(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      throw new Error(`${MIN_MINUTES}〜${MAX_MINUTES}分の間で入力してください。`);
    }
    return minutes;
  };

  return {
    /** 今の状態（残り秒数は計算済み） */
    state() {
      const state = read();
      return { ...state, remainingSec: remainingOf(state) };
    },

    get lastMinutes() { return lastMinutes(); },

    /** 集中する時間を選ぶ（作動中・一時停止中は変えられない） */
    setMinutes(value) {
      const state = read();
      if (state.phase === 'running' || state.phase === 'paused') return;
      const minutes = clampMinutes(value);
      store.set('lastMinutes', minutes);
      write(idleState(minutes, 'focus', state.subject));
    },

    /** 休憩タイマーにする */
    setBreak(minutes = BREAK_MINUTES) {
      const state = read();
      if (state.phase === 'running' || state.phase === 'paused') return;
      write(idleState(minutes, 'break', state.subject));
    },

    setSubject(text) {
      write({ ...read(), subject: String(text ?? '').slice(0, 40) });
    },

    start() {
      const state = read();
      if (state.phase === 'running') return;
      const remaining = state.phase === 'finished' ? state.plannedSec : state.remainingSec;
      write({
        ...state,
        phase: 'running',
        remainingSec: remaining,
        endsAt: Date.now() + remaining * 1000,
        startedAt: state.phase === 'paused' ? state.startedAt : new Date().toISOString(),
      });
    },

    pause() {
      const state = read();
      if (state.phase !== 'running') return;
      write({ ...state, phase: 'paused', remainingSec: remainingOf(state), endsAt: null });
    },

    /** 最初からやり直す（途中の時間は記録しない） */
    reset() {
      const state = read();
      write(idleState(Math.round(state.plannedSec / 60), state.kind, state.subject));
    },

    /**
     * 時間切れになっていたら finished にして、その回の情報を返す（1回だけ）。
     * 時間切れでなければ null。
     */
    settle() {
      const state = read();
      if (state.phase !== 'running' || remainingOf(state) > 0) return null;
      write({ ...state, phase: 'finished', remainingSec: 0, endsAt: null });
      return {
        kind: state.kind,
        minutes: Math.round(state.plannedSec / 60),
        startedAt: state.startedAt,
        subject: state.subject,
      };
    },

    /** 途中で終える。ここまでの経過秒数を返し、待機中に戻す */
    stopEarly() {
      const state = read();
      if (state.phase !== 'running' && state.phase !== 'paused') return null;
      const elapsedSec = state.plannedSec - remainingOf(state);
      write(idleState(Math.round(state.plannedSec / 60), state.kind, state.subject));
      return { kind: state.kind, elapsedSec, startedAt: state.startedAt, subject: state.subject };
    },
  };
}

/**
 * 時間切れの集中タイマーを学習記録に追加する。
 * 勉強画面を開いたとき・作動中は毎秒・ハブ画面の表示時に呼ぶので、
 * 別の画面にいる間に終わっていても記録が漏れません。
 * @returns 終わった回の情報（なければ null）
 */
export function settleAndRecord(timer, repo) {
  const finished = timer.settle();
  if (finished?.kind === 'focus') {
    repo.addSession({
      startedAt: finished.startedAt,
      minutes: finished.minutes,
      subject: finished.subject,
      source: 'pomodoro',
    });
  }
  return finished;
}
