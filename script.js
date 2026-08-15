/* =========================================================
   めばえ ― app logic
   ユーザーごとに localStorage へ保存されるので、ページを閉じても
   今日の進捗・タスク・メモ・ストリークは消えません。

   ※ ログインは「名前＋4桁の合言葉」による端末内だけの簡易的な
   仕組みです。サーバーを持たないため、本格的な認証や複数端末での
   同期はできません。
   ========================================================= */
(() => {
  const USERS_KEY = "mebae-users-v1";        // { [username]: pin }
  const ACTIVE_USER_KEY = "mebae-active-user";
  const RING_CIRCUMFERENCE = 2 * Math.PI * 104; // 653.45

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const defaultState = () => ({
    date: todayStr(),
    settings: {
      focusMin: 15,
      breakMin: 5,
      breakThreshold: 2, // 何セットごとに休憩を促すか
      ambient: true,
      sound: true,
      reduceMotion: false,
    },
    streak: 0,
    lastSessionDate: null,
    sessionsToday: 0,
    focusStreakSinceBreak: 0,
    tasks: [],        // { id, text, done, isParent }
    parking: [],       // { id, text }
    gardenToday: [],   // array of emoji
    memos: [],          // { id, date, hours, minutes, taskText, note }
    events: [],          // { id, date, startTime, endTime, title, category, customLabel?, customColor? }
    customCategoryHistory: [], // { name, color }[] その他カテゴリの履歴（最近使った順）
  });

  let currentUser = null;
  let STORAGE_KEY = null;
  let state = null;

  // ---------- users (login) ----------
  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  function userExists(name) {
    return Object.prototype.hasOwnProperty.call(getUsers(), name);
  }
  function createUser(name, pin) {
    const users = getUsers();
    users[name] = pin;
    saveUsers(users);
  }
  function verifyUser(name, pin) {
    const users = getUsers();
    return users[name] === pin;
  }

  // ---------- persistence ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (parsed.date !== todayStr()) {
        // 日付が変わった → ストリーク更新して今日分をリセット
        const fresh = defaultState();
        fresh.settings = parsed.settings;
        fresh.streak = computeStreakOnNewDay(parsed);
        fresh.lastSessionDate = parsed.lastSessionDate;
        fresh.memos = parsed.memos || [];
        fresh.events = parsed.events || [];
        const hist = parsed.customCategoryHistory || [];
        fresh.customCategoryHistory = hist.map(item => {
          if (typeof item === "string") return { name: item, color: "#A78BFA" };
          if (item && item.name) return { name: item.name, color: item.color || "#A78BFA" };
          return null;
        }).filter(Boolean);
        // 未完了タスクは翌日に持ち越す
        fresh.tasks = (parsed.tasks || []).filter(t => !t.done);
        return fresh;
      }
      if (!parsed.memos) parsed.memos = [];
      if (!parsed.events) parsed.events = [];
      if (!parsed.customCategoryHistory) parsed.customCategoryHistory = [];
      // 旧形式（文字列配列）を新形式（{name, color}）に変換
      parsed.customCategoryHistory = parsed.customCategoryHistory.map(item => {
        if (typeof item === "string") return { name: item, color: "#A78BFA" };
        if (item && item.name) return { name: item.name, color: item.color || "#A78BFA" };
        return null;
      }).filter(Boolean);
      return parsed;
    } catch (e) {
      console.warn("state load failed, using default", e);
      return defaultState();
    }
  }

  function computeStreakOnNewDay(prev) {
    if (!prev.lastSessionDate) return 0;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    if (prev.lastSessionDate === yesterday && prev.sessionsToday > 0) {
      return prev.streak; // 継続
    }
    if (prev.lastSessionDate === todayStr()) {
      return prev.streak;
    }
    return 0; // 途切れた
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);

  const loginScreen = $("loginScreen");
  const appRoot = $("appRoot");
  const loginForm = $("loginForm");
  const loginNameInput = $("loginNameInput");
  const loginPinInput = $("loginPinInput");
  const loginError = $("loginError");
  const activeUserName = $("activeUserName");
  const logoutBtn = $("logoutBtn");

  const modeLabel = $("modeLabel");
  const ringProgress = $("ringProgress");
  const timerDigits = $("timerDigits");
  const timerCurrentTask = $("timerCurrentTask");
  const startPauseBtn = $("startPauseBtn");
  const resetBtn = $("resetBtn");
  const skipBtn = $("skipBtn");
  const quickStartBtn = $("quickStartBtn");
  const lengthPresets = $("lengthPresets");
  const customLengthForm = $("customLengthForm");
  const customLengthInput = $("customLengthInput");
  const streakCount = $("streakCount");

  const bigTaskForm = $("bigTaskForm");
  const bigTaskInput = $("bigTaskInput");
  const microtaskList = $("microtaskList");
  const completedTaskList = $("completedTaskList");
  const microTaskForm = $("microTaskForm");
  const microTaskInput = $("microTaskInput");

  const parkingForm = $("parkingForm");
  const parkingInput = $("parkingInput");
  const parkingList = $("parkingList");

  const gardenStrip = $("gardenStrip");
  const gardenSub = $("gardenSub");

  const calPrevBtn = $("calPrevBtn");
  const calNextBtn = $("calNextBtn");
  const calTodayBtn = $("calTodayBtn");
  const calMonthLabel = $("calMonthLabel");
  const calendarGrid = $("calendarGrid");
  const eventForm = $("eventForm");
  const eventDateInput = $("eventDateInput");
  const eventStartTimeInput = $("eventStartTimeInput");
  const eventEndTimeInput = $("eventEndTimeInput");
  const eventTitleInput = $("eventTitleInput");
  const eventCategorySelect = $("eventCategorySelect");
  const otherCategoryFields = $("otherCategoryFields");
  const eventCustomCategoryInput = $("eventCustomCategoryInput");
  const eventCustomColorInput = $("eventCustomColorInput");
  const colorPreviewHint = $("colorPreviewHint");
  const selectedDayLabel = $("selectedDayLabel");
  const eventList = $("eventList");

  const memoForm = $("memoForm");
  const memoDateInput = $("memoDateInput");
  const memoHoursInput = $("memoHoursInput");
  const memoMinutesInput = $("memoMinutesInput");
  const memoTaskSelect = $("memoTaskSelect");
  const memoNoteInput = $("memoNoteInput");
  const memoCharCount = $("memoCharCount");
  const memoList = $("memoList");

  const breakModal = $("breakModal");
  const modalContinueBtn = $("modalContinueBtn");
  const modalBreakBtn = $("modalBreakBtn");

  const settingsBtn = $("settingsBtn");
  const settingsModal = $("settingsModal");
  const closeSettingsBtn = $("closeSettingsBtn");
  const breakLengthSelect = $("breakLengthSelect");
  const breakThresholdSelect = $("breakThresholdSelect");
  const ambientToggle = $("ambientToggle");
  const soundToggle = $("soundToggle");
  const reduceMotionToggle = $("reduceMotionToggle");
  const resetDataBtn = $("resetDataBtn");

  const toastEl = $("toast");

  // ---------- timer engine ----------
  let mode = "focus"; // "focus" | "break"
  let secondsTotal = 15 * 60;
  let secondsLeft = secondsTotal;
  let running = false;
  let tickHandle = null;
  let activeTaskId = null;
  let isQuickStart = false;

  const GARDEN_EMOJI = ["🌱", "🌿", "🌼", "🌻", "🌷", "🍀", "🌸", "🪴"];

  // ---------- calendar state ----------
  let calendarViewDate = new Date();
  let selectedDate = todayStr();
  const CATEGORY_LABEL = { study: "勉強", task: "課題", test: "テスト", other: "その他" };
  const CATEGORY_CLASS = { study: "cat-study", task: "cat-task", test: "cat-test", other: "cat-other" };

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  function renderRing() {
    const pct = secondsTotal > 0 ? secondsLeft / secondsTotal : 0;
    const offset = RING_CIRCUMFERENCE * (1 - pct);
    ringProgress.style.strokeDashoffset = offset;
  }

  function renderTimer() {
    timerDigits.textContent = formatTime(secondsLeft);
    renderRing();
    modeLabel.textContent = mode === "focus" ? "集中タイム" : "休憩タイム";
    modeLabel.classList.toggle("is-break", mode === "break");
    ringProgress.classList.toggle("is-break", mode === "break");
    startPauseBtn.textContent = running ? "一時停止" : (secondsLeft === secondsTotal ? "はじめる" : "再開する");

    const activeTask = state.tasks.find(t => t.id === activeTaskId);
    timerCurrentTask.textContent = mode === "break"
      ? "ゆっくり休んでね"
      : (activeTask ? activeTask.text : "今のタスクを選んでね");
  }

  function setMinutes(min) {
    if (running) return;
    state.settings.focusMin = min;
    secondsTotal = min * 60;
    secondsLeft = secondsTotal;
    saveState();
    renderTimer();
  }

  function tick() {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      completeSession();
      return;
    }
    renderTimer();
  }

  function startTimer() {
    running = true;
    tickHandle = setInterval(tick, 1000);
    renderTimer();
  }

  function pauseTimer() {
    running = false;
    clearInterval(tickHandle);
    renderTimer();
  }

  function toggleStartPause() {
    if (running) { pauseTimer(); } else { startTimer(); }
  }

  function resetTimer() {
    pauseTimer();
    secondsTotal = mode === "focus" ? state.settings.focusMin * 60 : state.settings.breakMin * 60;
    secondsLeft = secondsTotal;
    isQuickStart = false;
    renderTimer();
  }

  function switchMode(nextMode) {
    mode = nextMode;
    secondsTotal = mode === "focus" ? state.settings.focusMin * 60 : state.settings.breakMin * 60;
    secondsLeft = secondsTotal;
    renderTimer();
  }

  function playChime() {
    if (!state.settings.sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [660, 880];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.4);
      });
    } catch (e) { /* audio unsupported, ignore */ }
  }

  function completeSession() {
    pauseTimer();
    playChime();

    if (mode === "focus") {
      state.sessionsToday += 1;
      state.focusStreakSinceBreak += 1;
      state.lastSessionDate = todayStr();
      bumpStreak();
      growGarden();
      showToast(isQuickStart ? "2分やれた、それだけで十分えらい！" : "集中タイム完了！えらい！");
      saveState();
      renderStreak();

      const threshold = Number(state.settings.breakThreshold);
      if (state.focusStreakSinceBreak >= threshold) {
        openModal(breakModal);
      } else {
        switchMode("focus");
      }
    } else {
      showToast("おかえり、また集中していこう");
      switchMode("focus");
    }
    isQuickStart = false;
  }

  function bumpStreak() {
    if (state._streakBumpedDate !== todayStr()) {
      state.streak += 1;
      state._streakBumpedDate = todayStr();
    }
  }

  function growGarden() {
    const emoji = GARDEN_EMOJI[Math.floor(Math.random() * GARDEN_EMOJI.length)];
    state.gardenToday.push(emoji);
    renderGarden();
  }

  // ---------- garden ----------
  function renderGarden() {
    gardenStrip.innerHTML = "";
    state.gardenToday.forEach(emoji => {
      const span = document.createElement("span");
      span.className = "garden-sprout";
      span.textContent = emoji;
      gardenStrip.appendChild(span);
    });
    gardenSub.textContent = state.gardenToday.length === 0
      ? "今日はまだ何も咲いていません"
      : `今日は ${state.gardenToday.length} 個、芽が出ました`;
  }

  function renderStreak() {
    streakCount.textContent = state.streak;
  }

  // ---------- tasks ----------
  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function addBreakdown(bigTaskText) {
    const steps = [
      `${bigTaskText}：必要なものを机に用意する`,
      `${bigTaskText}：最初の一歩だけやる（2分でOK）`,
      `${bigTaskText}：続きを進める`,
      `${bigTaskText}：見直して仕上げる`,
    ];
    steps.forEach(text => {
      state.tasks.push({ id: uid(), text, done: false });
    });
    saveState();
    renderTasks();
    renderMemoTaskOptions();
  }

  function addMicroTask(text) {
    state.tasks.push({ id: uid(), text, done: false });
    saveState();
    renderTasks();
    renderMemoTaskOptions();
  }

  function toggleTaskDone(id) {
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;
    t.done = !t.done;
    if (t.done) {
      showToast("ひとつ終わった、いいペース！");
      if (activeTaskId === id) activeTaskId = null;
    }
    saveState();
    renderTasks();
    renderTimer();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    if (activeTaskId === id) activeTaskId = null;
    saveState();
    renderTasks();
    renderTimer();
    renderMemoTaskOptions();
  }

  function pickActiveTask(id) {
    activeTaskId = id;
    renderTasks();
    renderTimer();
  }

  function buildTaskRow(t, { showPick }) {
    const li = document.createElement("li");
    li.className = "microtask-item" + (t.done ? " is-done" : "") + (t.id === activeTaskId ? " is-active" : "");

    const check = document.createElement("button");
    check.className = "microtask-check" + (t.done ? " is-done" : "");
    check.innerHTML = t.done ? "✓" : "";
    check.setAttribute("aria-label", t.done ? "未完了に戻す" : "完了にする");
    check.addEventListener("click", () => toggleTaskDone(t.id));

    const text = document.createElement("span");
    text.className = "microtask-text";
    text.textContent = t.text;
    text.addEventListener("click", () => toggleTaskDone(t.id));

    li.appendChild(check);
    li.appendChild(text);

    if (showPick && !t.done) {
      const pick = document.createElement("button");
      pick.className = "microtask-pick";
      pick.textContent = t.id === activeTaskId ? "選択中" : "これをやる";
      pick.addEventListener("click", () => pickActiveTask(t.id));
      li.appendChild(pick);
    }

    const del = document.createElement("button");
    del.className = "microtask-del";
    del.innerHTML = "✕";
    del.setAttribute("aria-label", "削除");
    del.addEventListener("click", () => deleteTask(t.id));
    li.appendChild(del);

    return li;
  }

  function renderTasks() {
    const active = state.tasks.filter(t => !t.done);
    const done = state.tasks.filter(t => t.done);

    microtaskList.innerHTML = "";
    if (active.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "まだタスクがありません。大きいタスクを入力してみよう。";
      microtaskList.appendChild(li);
    } else {
      active.forEach(t => microtaskList.appendChild(buildTaskRow(t, { showPick: true })));
    }

    completedTaskList.innerHTML = "";
    if (done.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "達成したタスクがここに並びます。";
      completedTaskList.appendChild(li);
    } else {
      done.forEach(t => completedTaskList.appendChild(buildTaskRow(t, { showPick: false })));
    }
  }

  // ---------- parking lot ----------
  function addParkingItem(text) {
    state.parking.push({ id: uid(), text });
    saveState();
    renderParking();
  }

  function deleteParkingItem(id) {
    state.parking = state.parking.filter(p => p.id !== id);
    saveState();
    renderParking();
  }

  function renderParking() {
    parkingList.innerHTML = "";
    if (state.parking.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "気が散ったことは、ここに置いてから集中に戻ろう。";
      parkingList.appendChild(li);
      return;
    }
    state.parking.forEach(p => {
      const li = document.createElement("li");
      li.className = "parking-item";
      const span = document.createElement("span");
      span.textContent = "📌 " + p.text;
      const del = document.createElement("button");
      del.innerHTML = "✕";
      del.setAttribute("aria-label", "削除");
      del.addEventListener("click", () => deleteParkingItem(p.id));
      li.appendChild(span);
      li.appendChild(del);
      parkingList.appendChild(li);
    });
  }

  // ---------- calendar ----------
  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function renderCalendar() {
    const y = calendarViewDate.getFullYear();
    const m = calendarViewDate.getMonth();
    calMonthLabel.textContent = `${y}年${m + 1}月`;

    const firstDayOfWeek = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    calendarGrid.innerHTML = "";

    for (let i = 0; i < firstDayOfWeek; i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-day is-empty";
      calendarGrid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(y, m, d);
      const cell = document.createElement("div");
      cell.className = "calendar-day";
      if (key === todayStr()) cell.classList.add("is-today");
      if (key === selectedDate) cell.classList.add("is-selected");

      const num = document.createElement("div");
      num.className = "calendar-day-num";
      num.textContent = d;
      cell.appendChild(num);

      const dayEvents = state.events.filter(ev => ev.date === key);
      if (dayEvents.length > 0) {
        const dots = document.createElement("div");
        dots.className = "calendar-day-dots";
        dayEvents.slice(0, 4).forEach(ev => {
          const dot = document.createElement("span");
          if (ev.category === "other" && ev.customColor) {
            dot.className = "day-dot";
            dot.style.backgroundColor = ev.customColor;
          } else {
            dot.className = "day-dot " + (CATEGORY_CLASS[ev.category] || "cat-other");
          }
          dots.appendChild(dot);
        });
        cell.appendChild(dots);
      }

      cell.addEventListener("click", () => {
        selectedDate = key;
        eventDateInput.value = key;
        renderCalendar();
        renderSelectedDayEvents();
      });

      calendarGrid.appendChild(cell);
    }
  }

  // ---------- custom category history ----------
  // 形式: { name: string, color: string }[]
  const HISTORY_MAX = 12;

  function rememberCustomCategory(label, color) {
    const name = (label || "").trim();
    if (!name) return;
    const col = color || "#A78BFA";
    if (!state.customCategoryHistory) state.customCategoryHistory = [];
    // 同名があれば除去して先頭に（最新の色で上書き）
    state.customCategoryHistory = state.customCategoryHistory.filter(x => x.name !== name);
    state.customCategoryHistory.unshift({ name, color: col });
    if (state.customCategoryHistory.length > HISTORY_MAX) {
      state.customCategoryHistory = state.customCategoryHistory.slice(0, HISTORY_MAX);
    }
  }

  function applyCustomCategoryFromHistory(name) {
    const entry = (state.customCategoryHistory || []).find(x => x.name === name);
    if (!entry) return;
    eventCustomCategoryInput.value = entry.name;
    eventCustomColorInput.value = entry.color || "#A78BFA";
    if (colorPreviewHint) {
      colorPreviewHint.style.setProperty("--preview-color", entry.color || "#A78BFA");
    }
  }

  function renderCustomCategoryHistory() {
    const datalist = document.getElementById("customCategoryDatalist");
    const chipsEl = document.getElementById("customCategoryHistoryChips");
    if (!datalist || !chipsEl) return;

    const list = state.customCategoryHistory || [];
    datalist.innerHTML = "";
    list.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.name;
      datalist.appendChild(opt);
    });

    chipsEl.innerHTML = "";
    if (list.length === 0) return;
    // 直近5件をチップ表示（色ドット付き）
    list.slice(0, 5).forEach(item => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-chip";
      btn.title = item.name + "（色もセット）";

      const dot = document.createElement("span");
      dot.className = "history-chip-dot";
      dot.style.backgroundColor = item.color || "#A78BFA";

      const text = document.createElement("span");
      text.textContent = item.name;

      btn.appendChild(dot);
      btn.appendChild(text);
      btn.addEventListener("click", () => {
        applyCustomCategoryFromHistory(item.name);
        eventCustomCategoryInput.focus();
      });
      chipsEl.appendChild(btn);
    });
  }

  function addEvent({ date, startTime, endTime, title, category, customLabel, customColor }) {
    const ev = {
      id: uid(),
      date,
      startTime: startTime || "",
      endTime: endTime || "",
      title,
      category,
    };
    if (category === "other") {
      if (customLabel) ev.customLabel = customLabel;
      if (customColor) ev.customColor = customColor;
    }
    state.events.push(ev);
    if (category === "other" && customLabel) {
      rememberCustomCategory(customLabel, customColor);
    }
    saveState();
    renderCalendar();
    renderSelectedDayEvents();
    renderCustomCategoryHistory();
  }

  function deleteEvent(id) {
    state.events = state.events.filter(ev => ev.id !== id);
    saveState();
    renderCalendar();
    renderSelectedDayEvents();
  }

  function formatEventTime(ev) {
    // 旧データ互換: time があれば startTime として扱う
    const start = ev.startTime || ev.time || "";
    const end = ev.endTime || "";
    if (start && end) return `${start}〜${end}`;
    if (start) return start;
    if (end) return `〜${end}`;
    return "終日";
  }

  function renderSelectedDayEvents() {
    const [y, m, d] = selectedDate.split("-").map(Number);
    selectedDayLabel.textContent = `${m}月${d}日の予定`;

    const dayEvents = state.events
      .filter(ev => ev.date === selectedDate)
      .sort((a, b) => {
        const ta = a.startTime || a.time || "99:99";
        const tb = b.startTime || b.time || "99:99";
        return ta.localeCompare(tb);
      });

    eventList.innerHTML = "";
    if (dayEvents.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "この日の予定はまだありません。";
      eventList.appendChild(li);
      return;
    }

    dayEvents.forEach(ev => {
      const li = document.createElement("li");
      li.className = "event-item";

      const dot = document.createElement("span");
      if (ev.category === "other" && ev.customColor) {
        dot.className = "day-dot";
        dot.style.backgroundColor = ev.customColor;
      } else {
        dot.className = "day-dot " + (CATEGORY_CLASS[ev.category] || "cat-other");
      }

      const time = document.createElement("span");
      time.className = "event-item-time";
      time.textContent = formatEventTime(ev);

      const title = document.createElement("span");
      title.className = "event-item-title";
      title.textContent = ev.title;

      li.appendChild(dot);
      li.appendChild(time);
      li.appendChild(title);

      // その他でカスタム名がある場合はバッジ表示
      if (ev.category === "other" && ev.customLabel) {
        const catBadge = document.createElement("span");
        catBadge.className = "event-item-cat";
        catBadge.textContent = ev.customLabel;
        if (ev.customColor) {
          catBadge.style.borderColor = ev.customColor;
          catBadge.style.color = ev.customColor;
        }
        li.appendChild(catBadge);
      }

      const del = document.createElement("button");
      del.innerHTML = "✕";
      del.setAttribute("aria-label", "予定を削除");
      del.addEventListener("click", () => deleteEvent(ev.id));
      li.appendChild(del);

      eventList.appendChild(li);
    });
  }

  // ---------- study memo ----------
  function renderMemoTaskOptions() {
    const prevValue = memoTaskSelect.value;
    memoTaskSelect.innerHTML = '<option value="">選択しない</option>';
    state.tasks.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = (t.done ? "✓ " : "") + t.text;
      memoTaskSelect.appendChild(opt);
    });
    if (state.tasks.some(t => t.id === prevValue)) {
      memoTaskSelect.value = prevValue;
    }
  }

  function addMemo({ date, hours, minutes, taskId, note }) {
    const task = state.tasks.find(t => t.id === taskId);
    state.memos.unshift({
      id: uid(),
      date,
      hours,
      minutes,
      taskText: task ? task.text : "",
      note,
    });
    saveState();
    renderMemoList();
  }

  function deleteMemo(id) {
    state.memos = state.memos.filter(m => m.id !== id);
    saveState();
    renderMemoList();
  }

  function renderMemoList() {
    memoList.innerHTML = "";
    if (state.memos.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "まだ記録がありません。今日やったことを残してみよう。";
      memoList.appendChild(li);
      return;
    }
    state.memos.forEach(m => {
      const li = document.createElement("li");
      li.className = "memo-item";

      const head = document.createElement("div");
      head.className = "memo-item-head";

      const meta = document.createElement("div");
      meta.className = "memo-item-meta";

      const dateSpan = document.createElement("span");
      dateSpan.textContent = "📅 " + m.date;
      meta.appendChild(dateSpan);

      if (m.hours || m.minutes) {
        const timeSpan = document.createElement("span");
        timeSpan.className = "memo-item-time";
        timeSpan.textContent = `⏱ ${m.hours || 0}時間${m.minutes || 0}分`;
        meta.appendChild(timeSpan);
      }

      if (m.taskText) {
        const taskSpan = document.createElement("span");
        taskSpan.className = "memo-item-task";
        taskSpan.textContent = m.taskText;
        meta.appendChild(taskSpan);
      }

      const del = document.createElement("button");
      del.className = "memo-item-del";
      del.innerHTML = "✕";
      del.setAttribute("aria-label", "削除");
      del.addEventListener("click", () => deleteMemo(m.id));

      head.appendChild(meta);
      head.appendChild(del);
      li.appendChild(head);

      if (m.note) {
        const note = document.createElement("div");
        note.className = "memo-item-note";
        note.textContent = m.note;
        li.appendChild(note);
      }

      memoList.appendChild(li);
    });
  }

  // ---------- toast ----------
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), 2600);
  }

  // ---------- modals ----------
  function openModal(el) { el.classList.add("is-open"); }
  function closeModal(el) { el.classList.remove("is-open"); }

  // ---------- settings ----------
  function applySettingsToUI() {
    breakLengthSelect.value = state.settings.breakMin;
    breakThresholdSelect.value = state.settings.breakThreshold;
    ambientToggle.checked = state.settings.ambient;
    soundToggle.checked = state.settings.sound;
    reduceMotionToggle.checked = state.settings.reduceMotion;
    document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
    document.querySelector(".bg-sky").style.display = state.settings.ambient ? "block" : "none";

    lengthPresets.querySelectorAll(".chip").forEach(chip => {
      chip.classList.toggle("is-active", Number(chip.dataset.min) === state.settings.focusMin);
    });
  }

  // ---------- events (bound once; act on current `state`) ----------
  startPauseBtn.addEventListener("click", toggleStartPause);
  resetBtn.addEventListener("click", resetTimer);
  skipBtn.addEventListener("click", () => {
    pauseTimer();
    switchMode(mode === "focus" ? "break" : "focus");
  });

  quickStartBtn.addEventListener("click", () => {
    if (running) return;
    isQuickStart = true;
    mode = "focus";
    secondsTotal = 120;
    secondsLeft = 120;
    renderTimer();
    startTimer();
    showToast("まずは2分だけ。それでいい。");
  });

  lengthPresets.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip || running) return;
    lengthPresets.querySelectorAll(".chip").forEach(c => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    setMinutes(Number(chip.dataset.min));
  });

  customLengthForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (running) { showToast("タイマーを止めてから変更してね"); return; }
    const raw = Number(customLengthInput.value);
    if (!raw || raw < 1) { showToast("1分以上の数字を入力してね"); return; }
    const min = Math.min(180, Math.round(raw));
    lengthPresets.querySelectorAll(".chip").forEach(c => c.classList.remove("is-active"));
    setMinutes(min);
    customLengthInput.value = "";
    showToast(`${min}分にセットしたよ`);
  });

  bigTaskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = bigTaskInput.value.trim();
    if (!val) return;
    addBreakdown(val);
    bigTaskInput.value = "";
  });

  microTaskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = microTaskInput.value.trim();
    if (!val) return;
    addMicroTask(val);
    microTaskInput.value = "";
  });

  parkingForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = parkingInput.value.trim();
    if (!val) return;
    addParkingItem(val);
    parkingInput.value = "";
    showToast("置いといたよ。集中に戻ろう。");
  });

  calPrevBtn.addEventListener("click", () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
    renderCalendar();
  });
  calNextBtn.addEventListener("click", () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
    renderCalendar();
  });
  calTodayBtn.addEventListener("click", () => {
    calendarViewDate = new Date();
    selectedDate = todayStr();
    eventDateInput.value = selectedDate;
    renderCalendar();
    renderSelectedDayEvents();
  });

  eventForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = eventDateInput.value || todayStr();
    const startTime = eventStartTimeInput.value || "";
    const endTime = eventEndTimeInput.value || "";
    const title = eventTitleInput.value.trim();
    const category = eventCategorySelect.value;
    if (!title) { showToast("予定のタイトルを入力してね"); return; }

    let customLabel = "";
    let customColor = "";
    if (category === "other") {
      customLabel = eventCustomCategoryInput.value.trim();
      customColor = eventCustomColorInput.value || "#A78BFA";
    }

    addEvent({ date, startTime, endTime, title, category, customLabel, customColor });

    selectedDate = date;
    eventTitleInput.value = "";
    eventStartTimeInput.value = "";
    eventEndTimeInput.value = "";
    eventCustomCategoryInput.value = "";
    eventCustomColorInput.value = "#A78BFA";
    if (colorPreviewHint) {
      colorPreviewHint.style.setProperty("--preview-color", "#A78BFA");
    }
    if (otherCategoryFields) otherCategoryFields.hidden = true;
    eventCategorySelect.value = "study";
    showToast("予定を追加したよ");
  });

  // カテゴリ「その他」選択時にカスタム入力を表示
  eventCategorySelect.addEventListener("change", () => {
    const isOther = eventCategorySelect.value === "other";
    if (otherCategoryFields) otherCategoryFields.hidden = !isOther;
    if (isOther && eventCustomColorInput) {
      const col = eventCustomColorInput.value || "#A78BFA";
      if (colorPreviewHint) colorPreviewHint.style.setProperty("--preview-color", col);
    }
  });

  // カラーピッカーのプレビュー連動
  if (eventCustomColorInput) {
    eventCustomColorInput.addEventListener("input", () => {
      const col = eventCustomColorInput.value;
      if (colorPreviewHint) colorPreviewHint.style.setProperty("--preview-color", col);
    });
  }

  // カテゴリ名を入力／候補選択したとき、履歴にあれば色もセット
  if (eventCustomCategoryInput) {
    const tryApplyColorFromName = () => {
      const name = eventCustomCategoryInput.value.trim();
      if (!name) return;
      const entry = (state.customCategoryHistory || []).find(x => x.name === name);
      if (entry) {
        eventCustomColorInput.value = entry.color || "#A78BFA";
        if (colorPreviewHint) {
          colorPreviewHint.style.setProperty("--preview-color", entry.color || "#A78BFA");
        }
      }
    };
    eventCustomCategoryInput.addEventListener("change", tryApplyColorFromName);
    eventCustomCategoryInput.addEventListener("blur", tryApplyColorFromName);
  }

  memoNoteInput.addEventListener("input", () => {
    const len = memoNoteInput.value.length;
    memoCharCount.textContent = `${len}/100`;
    memoCharCount.classList.toggle("is-near-limit", len >= 90);
  });

  memoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = memoDateInput.value || todayStr();
    const hours = Math.max(0, Math.min(23, Number(memoHoursInput.value) || 0));
    const minutes = Math.max(0, Math.min(59, Number(memoMinutesInput.value) || 0));
    const taskId = memoTaskSelect.value;
    const note = memoNoteInput.value.trim().slice(0, 100);

    addMemo({ date, hours, minutes, taskId, note });

    memoHoursInput.value = "";
    memoMinutesInput.value = "";
    memoNoteInput.value = "";
    memoCharCount.textContent = "0/100";
    memoCharCount.classList.remove("is-near-limit");
    memoDateInput.value = todayStr();
    showToast("記録したよ、おつかれさま！");
  });

  modalContinueBtn.addEventListener("click", () => {
    closeModal(breakModal);
    state.focusStreakSinceBreak = 0;
    saveState();
    switchMode("focus");
  });
  modalBreakBtn.addEventListener("click", () => {
    closeModal(breakModal);
    state.focusStreakSinceBreak = 0;
    saveState();
    switchMode("break");
    startTimer();
  });

  settingsBtn.addEventListener("click", () => openModal(settingsModal));
  closeSettingsBtn.addEventListener("click", () => closeModal(settingsModal));
  settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) closeModal(settingsModal); });
  breakModal.addEventListener("click", (e) => { if (e.target === breakModal) closeModal(breakModal); });

  breakLengthSelect.addEventListener("change", () => {
    state.settings.breakMin = Number(breakLengthSelect.value);
    saveState();
    if (mode === "break" && !running) resetTimer();
  });
  breakThresholdSelect.addEventListener("change", () => {
    state.settings.breakThreshold = Number(breakThresholdSelect.value);
    saveState();
  });
  ambientToggle.addEventListener("change", () => {
    state.settings.ambient = ambientToggle.checked;
    saveState();
    applySettingsToUI();
  });
  soundToggle.addEventListener("change", () => {
    state.settings.sound = soundToggle.checked;
    saveState();
  });
  reduceMotionToggle.addEventListener("change", () => {
    state.settings.reduceMotion = reduceMotionToggle.checked;
    saveState();
    applySettingsToUI();
  });

  resetDataBtn.addEventListener("click", () => {
    if (!confirm("今日のタスク・メモ・庭の記録をリセットします。よろしいですか？")) return;
    const settings = state.settings;
    const streak = state.streak;
    const lastSessionDate = state.lastSessionDate;
    state = defaultState();
    state.settings = settings;
    state.streak = streak;
    state.lastSessionDate = lastSessionDate;
    saveState();
    renderAll();
    closeModal(settingsModal);
    showToast("リセットしました");
  });

  logoutBtn.addEventListener("click", () => {
    pauseTimer();
    localStorage.removeItem(ACTIVE_USER_KEY);
    currentUser = null;
    state = null;
    STORAGE_KEY = null;
    appRoot.style.display = "none";
    loginScreen.style.display = "flex";
    loginNameInput.value = "";
    loginPinInput.value = "";
    loginError.textContent = "";
  });

  // ---------- login flow ----------
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = loginNameInput.value.trim();
    const pin = loginPinInput.value.trim();

    if (!name) { loginError.textContent = "名前を入力してね"; return; }
    if (!/^\d{4}$/.test(pin)) { loginError.textContent = "合言葉は4桁の数字で入力してね"; return; }

    if (userExists(name)) {
      if (!verifyUser(name, pin)) {
        loginError.textContent = "名前か合言葉が違うみたい";
        return;
      }
    } else {
      createUser(name, pin);
    }

    loginError.textContent = "";
    localStorage.setItem(ACTIVE_USER_KEY, name);
    loginAs(name);
  });

  function loginAs(name) {
    currentUser = name;
    STORAGE_KEY = `mebae-state-v1::${name}`;
    state = loadState();

    activeUserName.textContent = name;
    loginScreen.style.display = "none";
    appRoot.style.display = "block";

    renderAll();
    saveState();
  }

  // ---------- init ----------
  function renderAll() {
    mode = "focus";
    secondsTotal = state.settings.focusMin * 60;
    secondsLeft = secondsTotal;
    activeTaskId = null;

    applySettingsToUI();
    renderTimer();
    renderTasks();
    renderParking();
    renderGarden();
    renderStreak();
    renderMemoTaskOptions();
    renderMemoList();
    renderCustomCategoryHistory();

    memoDateInput.value = todayStr();
    memoCharCount.textContent = "0/100";

    calendarViewDate = new Date();
    selectedDate = todayStr();
    eventDateInput.value = selectedDate;
    renderCalendar();
    renderSelectedDayEvents();
  }

  const savedUser = localStorage.getItem(ACTIVE_USER_KEY);
  if (savedUser && userExists(savedUser)) {
    loginAs(savedUser);
  } else {
    loginScreen.style.display = "flex";
    appRoot.style.display = "none";
  }
})();