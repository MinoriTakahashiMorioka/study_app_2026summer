import { DEFAULT_LABELS, uid } from '../../models/schema.js';

/**
 * カレンダーのデータ操作（読み書き・入力チェック）をまとめたもの。
 * 画面側はここの関数だけを使い、localStorage を直接触りません。
 *
 * データが変わると subscribe() で登録した関数が呼ばれるので、
 * 画面は「変わったら描き直す」だけで常に最新の状態を表示できます。
 *
 * @param {ReturnType<import('../../core/storage.js').createStore>} store
 */
export function createCalendarRepo(store) {
  const listeners = new Set();
  const emit = () => { for (const fn of [...listeners]) fn(); };

  // ---------- 読み書き ----------

  /** @returns {import('../../models/schema.js').Label[]} */
  function readLabels() {
    const saved = store.get('labels', null);
    if (Array.isArray(saved)) return saved;
    // 初回だけデフォルトのラベルを用意する
    const seeded = DEFAULT_LABELS.map((label) => ({ ...label }));
    store.set('labels', seeded);
    return seeded;
  }

  function writeLabels(labels) {
    store.set('labels', labels);
    emit();
  }

  /** @returns {import('../../models/schema.js').CalendarEvent[]} */
  function readEvents() {
    const saved = store.get('events', []);
    return Array.isArray(saved) ? saved : [];
  }

  function writeEvents(events) {
    store.set('events', events);
    emit();
  }

  // ---------- 入力チェック ----------

  const normalize = (text) => text.normalize('NFKC').trim().toLowerCase();

  function checkLabelName(name, exceptId = null) {
    const value = String(name ?? '').trim();
    if (!value) throw new Error('ラベル名を入力してください。');
    if ([...value].length > 12) throw new Error('ラベル名は12文字以内にしてください。');
    const duplicate = readLabels().some((l) => l.id !== exceptId && normalize(l.name) === normalize(value));
    if (duplicate) throw new Error(`「${value}」というラベルはもうあります。`);
    return value;
  }

  function checkColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color ?? '')) throw new Error('色の指定が正しくありません。');
    return color.toUpperCase();
  }

  // 終日（time が null）を先に、そのあと時間順
  const byTime = (a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt);

  const matchesFilter = (labelFilter) => (event) => labelFilter == null || event.labelId === labelFilter;

  // ---------- 公開する操作 ----------

  return {
    /** データが変わったら fn を呼ぶ。戻り値の関数で解除 */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // ラベル

    labels() {
      return [...readLabels()].sort((a, b) => a.order - b.order);
    },

    labelMap() {
      return new Map(readLabels().map((label) => [label.id, label]));
    },

    addLabel({ name, color }) {
      const labels = readLabels();
      const label = {
        id: uid(),
        name: checkLabelName(name),
        color: checkColor(color),
        isDefault: false,
        order: Math.max(-1, ...labels.map((l) => l.order)) + 1,
      };
      writeLabels([...labels, label]);
      return label;
    },

    updateLabel(id, patch) {
      const labels = readLabels();
      const index = labels.findIndex((l) => l.id === id);
      if (index < 0) throw new Error('ラベルが見つかりません。');
      const next = { ...labels[index] };
      if ('name' in patch) next.name = checkLabelName(patch.name, id);
      if ('color' in patch) next.color = checkColor(patch.color);
      labels[index] = next;
      writeLabels(labels);
      return next;
    },

    /** カスタムラベルを削除。そのラベルが付いていた予定は「ラベルなし」になる */
    deleteLabel(id) {
      const labels = readLabels();
      const target = labels.find((l) => l.id === id);
      if (!target) return;
      if (target.isDefault) throw new Error('標準のラベルは削除できません。');
      store.set('events', readEvents().map((e) => (e.labelId === id ? { ...e, labelId: null } : e)));
      writeLabels(labels.filter((l) => l.id !== id));
    },

    countEventsWithLabel(id) {
      return readEvents().filter((e) => e.labelId === id).length;
    },

    // 予定

    events() {
      return readEvents();
    },

    /** ある日の予定（時間順） */
    eventsOn(dateKey, labelFilter = null) {
      return readEvents()
        .filter((e) => e.date === dateKey)
        .filter(matchesFilter(labelFilter))
        .sort(byTime);
    },

    /** 日付ごとにまとめた予定（月表示用） @returns {Map<string, CalendarEvent[]>} */
    eventsByDate(labelFilter = null) {
      const map = new Map();
      for (const event of readEvents().filter(matchesFilter(labelFilter))) {
        if (!map.has(event.date)) map.set(event.date, []);
        map.get(event.date).push(event);
      }
      for (const list of map.values()) list.sort(byTime);
      return map;
    },

    /** 予定を追加（id なし）または更新（id あり） */
    saveEvent(input) {
      const title = String(input.title ?? '').trim();
      if (!title) throw new Error('タイトルを入力してください。');
      if ([...title].length > 60) throw new Error('タイトルは60文字以内にしてください。');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '')) throw new Error('日付を選んでください。');

      let time = input.time || null;
      if (time) {
        if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) throw new Error('時間の形式が正しくありません。');
        time = time.slice(0, 5);
      }

      const labelId = input.labelId && readLabels().some((l) => l.id === input.labelId) ? input.labelId : null;
      const now = new Date().toISOString();
      const events = readEvents();

      const saved = {
        id: input.id ?? uid(),
        title,
        date: input.date,
        time,
        labelId,
        memo: String(input.memo ?? '').trim(),
        createdAt: input.createdAt ?? now,
        updatedAt: now,
      };

      const index = events.findIndex((e) => e.id === saved.id);
      if (index >= 0) events[index] = saved;
      else events.push(saved);
      writeEvents(events);
      return saved;
    },

    deleteEvent(id) {
      writeEvents(readEvents().filter((e) => e.id !== id));
    },
  };
}
