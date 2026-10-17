import { uid, toDateKey } from '../../models/schema.js';

/**
 * 履歴書のデータ。
 *
 * @typedef {Object} HistoryRow   学歴・職歴の1行
 * @property {string} id
 * @property {number} year
 * @property {number} month       1〜12
 * @property {'学歴' | '職歴'} kind
 * @property {string} text        例: 「さくら高等学校 入学」
 *
 * @typedef {Object} LicenseRow   資格・免許の1行
 * @property {string} id
 * @property {number} year
 * @property {number} month
 * @property {'資格' | '免許'} kind
 * @property {string} name        例: 「普通自動車第一種運転免許 取得」
 *
 * @typedef {Object} Resume
 * @property {string} updatedOn   'YYYY-MM-DD'（「〇年〇月〇日現在」）
 * @property {string | null} photo  顔写真（縦横 3:4 に切り抜いた JPEG の data URL）
 * @property {string} name / nameKana
 * @property {string} birthDate   'YYYY-MM-DD'
 * @property {string} postalCode / address / addressKana
 * @property {string} phone / mobile
 * @property {HistoryRow[]} history
 * @property {LicenseRow[]} licenses
 * @property {boolean} isSample   お試し用のサンプルなら true
 */

export const HISTORY_KINDS = ['学歴', '職歴'];
export const LICENSE_KINDS = ['資格', '免許'];

const emptyResume = () => ({
  updatedOn: toDateKey(),
  photo: null,
  name: '',
  nameKana: '',
  birthDate: '',
  postalCode: '',
  address: '',
  addressKana: '',
  phone: '',
  mobile: '',
  history: [],
  licenses: [],
  isSample: false,
});

const byDate = (a, b) => a.year - b.year || a.month - b.month;

/** 学歴を先に、そのあと職歴。それぞれ古い順 */
export function sortHistory(rows) {
  return [...rows].sort((a, b) => HISTORY_KINDS.indexOf(a.kind) - HISTORY_KINDS.indexOf(b.kind) || byDate(a, b));
}

export function sortLicenses(rows) {
  return [...rows].sort(byDate);
}

export class ResumeError extends Error {
  constructor(message, rowId = null) {
    super(message);
    this.rowId = rowId;
  }
}

/** @param {ReturnType<import('../../core/storage.js').createStore>} store */
export function createResumeRepo(store) {
  const listeners = new Set();
  const emit = () => { for (const fn of [...listeners]) fn(); };

  function checkRows(rows, kinds, textKey, label) {
    const result = [];
    for (const row of rows) {
      const text = String(row[textKey] ?? '').trim();
      const hasDate = row.year !== '' && row.year != null;
      if (!text && !hasDate) continue; // 空の行は捨てる
      const year = Number(row.year);
      const month = Number(row.month);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new ResumeError(`${label}の「年」は西暦4けた（例: 2020）で入力してください。`, row.id);
      if (!Number.isInteger(month) || month < 1 || month > 12) throw new ResumeError(`${label}の「月」を選んでください。`, row.id);
      if (!text) throw new ResumeError(`${label}の内容を入力してください。`, row.id);
      result.push({ id: row.id ?? uid(), year, month, kind: kinds.includes(row.kind) ? row.kind : kinds[0], [textKey]: text.slice(0, 80) });
    }
    return result;
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** @returns {Resume} */
    get() {
      return { ...emptyResume(), ...(store.get('resume', null) ?? {}) };
    },

    hasData() {
      return store.get('resume', null) != null;
    },

    /**
     * 入力チェックをして保存する。
     * @returns {{ saved: Resume, persisted: boolean }} persisted が false なら端末の容量不足などで保存できていない
     */
    save(input) {
      const text = (value, max = 100) => String(value ?? '').trim().slice(0, max);
      const phone = (value, label) => {
        const v = text(value, 20);
        if (v && !/^[0-9０-９+()（）\-‐ー－ ]+$/.test(v)) throw new ResumeError(`${label}は数字とハイフンで入力してください。`);
        return v.normalize('NFKC').replace(/[‐ー－]/g, '-');
      };
      const postal = text(input.postalCode, 10).normalize('NFKC').replace(/[^\d]/g, '');
      if (postal && postal.length !== 7) throw new ResumeError('郵便番号は7けたで入力してください。');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.updatedOn ?? '')) throw new ResumeError('更新日を入力してください。');
      if (input.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new ResumeError('生年月日の形式が正しくありません。');

      const saved = {
        updatedOn: input.updatedOn,
        photo: input.photo ?? null,
        name: text(input.name, 30),
        nameKana: text(input.nameKana, 40),
        birthDate: input.birthDate || '',
        postalCode: postal ? `${postal.slice(0, 3)}-${postal.slice(3)}` : '',
        address: text(input.address, 120),
        addressKana: text(input.addressKana, 160),
        phone: phone(input.phone, '電話番号'),
        mobile: phone(input.mobile, '携帯電話番号'),
        history: sortHistory(checkRows(input.history ?? [], HISTORY_KINDS, 'text', '学歴・職歴')),
        licenses: sortLicenses(checkRows(input.licenses ?? [], LICENSE_KINDS, 'name', '資格・免許')),
        isSample: false,
      };
      const persisted = store.set('resume', saved);
      emit();
      return { saved, persisted };
    },

    /** お試し用のサンプルを入れる（demo アカウントの初回だけ） */
    seedSample(sample) {
      store.set('resume', { ...emptyResume(), ...sample, isSample: true });
    },

    pref(key, fallback) { return store.get(`pref.${key}`, fallback); },
    setPref(key, value) { store.set(`pref.${key}`, value); },
  };
}

/**
 * 画像ファイルを履歴書用の写真（縦横 3:4、360×480px の JPEG）にする。
 * 顔が上寄りになることが多いので、縦に余るときは少し上側を残して切り抜きます。
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
export async function fileToPhoto(file) {
  if (!file || !file.type.startsWith('image/')) throw new ResumeError('画像ファイル（JPEG・PNG など）を選んでください。');
  if (file.size > 20 * 1024 * 1024) throw new ResumeError('20MB 以下の画像を選んでください。');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new ResumeError('画像を読み込めませんでした。別の画像で試してください。'));
      image.src = url;
    });

    const W = 360;
    const H = 480;
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (sw / sh > W / H) {
      const cropped = sh * (W / H);
      sx = (sw - cropped) / 2;
      sw = cropped;
    } else {
      const cropped = sw / (W / H);
      sy = (sh - cropped) * 0.35;
      sh = cropped;
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
