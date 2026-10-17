/**
 * 効果音（タイマー終了のチャイムなど）。
 *
 * スマホのブラウザは「ユーザーがボタンを押したとき」にしか音を鳴らす準備ができないため、
 * スタートボタンを押したときに unlockAudio() を呼んでおき、
 * 終了時に chime() で鳴らします。
 */

let audioContext = null;

export function unlockAudio() {
  try {
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext ??= new AudioCtor();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch {
    // 音が使えない環境では何もしない
  }
}

/** ポーン・ポーン・ポーンと3回鳴らす */
export function chime() {
  if (!audioContext) return;
  try {
    const start = audioContext.currentTime + 0.05;
    [880, 880, 1175].forEach((frequency, i) => {
      const at = start + i * 0.4;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    });
  } catch {
    // 鳴らせなくても動作は続ける
  }
}

/** 対応端末なら振動させる（iPhone の Safari は非対応） */
export function vibrate(pattern = [200, 100, 200]) {
  try { navigator.vibrate?.(pattern); } catch { /* 非対応 */ }
}
