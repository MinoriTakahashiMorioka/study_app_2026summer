import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { unlockAudio } from '../../core/sound.js';
import { POMODORO_PRESETS } from '../../models/schema.js';
import { BREAK_MINUTES, MAX_MINUTES, MIN_MINUTES } from './timer.js';
import { formatClock, formatMinutes } from './format.js';

const RADIUS = 120;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * ポモドーロタイマーの画面。
 * 時間を進める処理は index.js の時計が担当し、この画面は onTick で表示を更新するだけです。
 * @returns {() => void} 後片付け関数
 */
export function mountTimerView(root, { repo, timer, show, onTick }) {
  // ---------- 円形の残り時間 ----------

  const ring = h('div', {
    class: 'ring',
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 280 280">
      <circle class="ring-track" cx="140" cy="140" r="${RADIUS}"/>
      <circle class="ring-progress" cx="140" cy="140" r="${RADIUS}"
        stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="0" transform="rotate(-90 140 140)"/>
    </svg>`,
  });
  const progressArc = ring.querySelector('.ring-progress');

  const kindLabel = h('span', { class: 'clock-kind' });
  const clock = h('span', { class: 'clock', role: 'timer', 'aria-live': 'off' });
  const subjectLine = h('span', { class: 'clock-subject' });

  const face = h('div', { class: 'timer-face' },
    ring,
    h('div', { class: 'timer-center' }, kindLabel, clock, subjectLine),
  );

  const controls = h('div', { class: 'timer-controls' });
  const message = h('p', { class: 'timer-message', role: 'status' });

  // ---------- 何を勉強する？ ----------

  const datalist = h('datalist', { id: 'study-subjects' },
    repo.subjectSuggestions().map((name) => h('option', { value: name })));

  const subjectInput = h('input', {
    id: 'timer-subject',
    class: 'text-input',
    type: 'text',
    maxlength: '40',
    list: 'study-subjects',
    autocomplete: 'off',
    placeholder: '例: 数学の課題（空欄でもOK）',
    value: timer.state().subject,
  });
  subjectInput.addEventListener('input', () => {
    timer.setSubject(subjectInput.value);
    paint(true);
  });

  // ---------- 時間の選択 ----------

  const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'タイマーの時間' });
  const customInput = h('input', {
    id: 'timer-custom',
    class: 'text-input',
    type: 'number',
    inputmode: 'numeric',
    min: String(MIN_MINUTES),
    max: String(MAX_MINUTES),
    step: '1',
    placeholder: '分',
    'aria-label': '自由な分数',
  });
  const customError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const customForm = h('form', {
    class: 'custom-minutes',
    novalidate: true,
    onSubmit: (event) => {
      event.preventDefault();
      try {
        timer.setMinutes(customInput.value);
        customInput.value = '';
        customError.hidden = true;
        paint(true);
      } catch (err) {
        customError.replaceChildren(icon('alert'), h('span', {}, err.message));
        customError.hidden = false;
      }
    },
  },
    h('label', { class: 'field-label', for: 'timer-custom' }, '自由に入力'),
    h('div', { class: 'custom-row' },
      customInput,
      h('span', { class: 'unit' }, '分'),
      h('button', { type: 'submit', class: 'btn btn-ghost' }, 'セット'),
    ),
  );
  const lockNote = h('p', { class: 'lock-note', hidden: true }, 'タイマーを止めると時間を変えられます。');

  // ---------- 操作 ----------

  const act = (fn) => () => {
    unlockAudio(); // ボタンを押したタイミングで音の準備をする（スマホ対策）
    message.textContent = '';
    fn();
    paint(true);
  };

  const start = act(() => timer.start());
  const pause = act(() => timer.pause());
  const reset = act(() => timer.reset());

  const stop = act(() => {
    const result = timer.stopEarly();
    if (!result) return;
    if (result.kind === 'break') {
      message.textContent = '休憩を終えました。';
      return;
    }
    const minutes = Math.round(result.elapsedSec / 60);
    if (minutes < 1) {
      message.textContent = '1分未満だったので記録しませんでした。';
      return;
    }
    repo.addSession({ startedAt: result.startedAt, minutes, subject: result.subject, source: 'pomodoro' });
    message.textContent = `${formatMinutes(minutes)}を記録しました。`;
  });

  const startBreak = act(() => { timer.setBreak(BREAK_MINUTES); timer.start(); });
  const again = act(() => { timer.setMinutes(timer.lastMinutes); timer.start(); });

  function renderControls(state) {
    const button = (label, iconName, onClick, kind = 'ghost') =>
      h('button', { type: 'button', class: `btn btn-${kind}`, onClick }, icon(iconName), label);

    if (state.phase === 'finished') {
      const isFocus = state.kind === 'focus';
      controls.replaceChildren(
        h('div', { class: 'finish' },
          h('p', { class: 'finish-title' }, isFocus ? 'おつかれさまでした！' : '休憩おわり！'),
          h('p', { class: 'finish-text' },
            isFocus ? `${formatMinutes(Math.round(state.plannedSec / 60))}の集中を記録しました。` : 'もうひと頑張りしましょう。'),
          h('div', { class: 'finish-actions' }, isFocus
            ? [
              button(`${BREAK_MINUTES}分休憩`, 'coffee', startBreak, 'primary'),
              button(`もう一度 ${timer.lastMinutes}分`, 'reset', again),
              button('記録を見る', 'chart', () => show('log')),
            ]
            : [
              button(`集中 ${timer.lastMinutes}分`, 'play', again, 'primary'),
              button('時間を選ぶ', 'timer', act(() => timer.setMinutes(timer.lastMinutes))),
            ]),
        ),
      );
      return;
    }

    const big = (label, iconName, onClick) =>
      h('button', { type: 'button', class: 'btn btn-primary btn-big', onClick }, icon(iconName), label);

    if (state.phase === 'idle') {
      controls.replaceChildren(big(state.kind === 'break' ? '休憩スタート' : 'スタート', 'play', start));
    } else if (state.phase === 'running') {
      controls.replaceChildren(
        big('一時停止', 'pause', pause),
        button(state.kind === 'break' ? '休憩を終える' : '終了して記録', 'stop', stop),
      );
    } else {
      controls.replaceChildren(
        button('やり直す', 'reset', reset),
        big('再開', 'play', start),
        button(state.kind === 'break' ? '休憩を終える' : '終了して記録', 'stop', stop),
      );
    }
  }

  function renderPresets(state) {
    const locked = state.phase === 'running' || state.phase === 'paused';
    const selected = state.kind === 'focus' ? Math.round(state.plannedSec / 60) : null;

    presets.replaceChildren(...POMODORO_PRESETS.map((minutes) => h('button', {
      type: 'button',
      class: 'preset',
      disabled: locked,
      'aria-pressed': String(minutes === selected),
      onClick: act(() => timer.setMinutes(minutes)),
    }, h('b', {}, minutes), h('span', {}, '分'))));

    const isCustom = selected != null && !POMODORO_PRESETS.includes(selected);
    customForm.classList.toggle('is-active', isCustom);
    customInput.placeholder = isCustom ? `${selected}` : '分';
    for (const el of customForm.querySelectorAll('input, button')) el.disabled = locked;
    lockNote.hidden = !locked;
  }

  // ---------- 表示の更新 ----------

  let last = '';

  /** @param {boolean} force ボタン類も作り直す */
  function paint(force = false) {
    const state = timer.state();
    const elapsed = state.plannedSec ? 1 - state.remainingSec / state.plannedSec : 0;

    clock.textContent = formatClock(state.remainingSec);
    progressArc.setAttribute('stroke-dashoffset', (CIRCUMFERENCE * elapsed).toFixed(2));
    face.dataset.phase = state.phase;
    face.dataset.kind = state.kind;

    kindLabel.textContent = state.phase === 'paused' ? '一時停止中'
      : state.phase === 'finished' ? '完了'
      : state.kind === 'break' ? '休憩' : '集中';
    subjectLine.textContent = state.kind === 'break' ? 'ひと息つきましょう' : (state.subject || '');

    const signature = `${state.phase}|${state.kind}|${state.plannedSec}`;
    if (force || signature !== last) {
      last = signature;
      renderControls(state);
      renderPresets(state);
      clock.setAttribute('aria-label', `残り ${formatClock(state.remainingSec)}`);
    }
  }

  // スペースキーでスタート／一時停止（入力欄にいるときは除く）
  const onKey = (event) => {
    if (event.code !== 'Space' || event.target.closest?.('input, textarea, button, select, [contenteditable]')) return;
    event.preventDefault();
    const { phase } = timer.state();
    if (phase === 'running') pause();
    else if (phase !== 'finished') start();
  };
  document.addEventListener('keydown', onKey);

  root.append(
    h('div', { class: 'timer' },
      h('div', { class: 'timer-main' },
        face,
        controls,
        message,
      ),
      h('div', { class: 'timer-side' },
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'timer-subject' }, '何を勉強する？'),
          subjectInput,
          datalist,
        ),
        h('div', { class: 'field' },
          h('span', { class: 'field-label' }, '時間を選ぶ'),
          presets,
        ),
        customForm,
        customError,
        lockNote,
      ),
    ),
  );

  paint(true);
  const offTick = onTick(() => paint());

  return () => {
    offTick();
    document.removeEventListener('keydown', onKey);
  };
}
