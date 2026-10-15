const APP_STATE = {
  settings: {
    theme: 'auto', // 'auto' | 'dark' | 'light' | 'matrix'
    clockSize: 'normal',
    showDate: true,
    showSeconds: true,
    vibrate: true,
    sections: {
      clock: true,
      stopwatch: true,
      alarm: true
    }
  },
  alarms: [],
  stopwatch: {
    startTime: 0,
    elapsedTime: 0,
    timerId: null,
    running: false,
    laps: []
  },
  audioCtx: null,
  wakeLock: null
};

// ----------------------------------------------------
// 1. 周辺視野対応音響 & スマホバイブレーション
// ----------------------------------------------------
function playAlarmAlert() {
  // Web Audio APIによる明瞭な警報音（高音2連パルス）
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!APP_STATE.audioCtx) APP_STATE.audioCtx = new AudioContextClass();
      if (APP_STATE.audioCtx.state === 'suspended') APP_STATE.audioCtx.resume();

      const ctx = APP_STATE.audioCtx;
      const now = ctx.currentTime;

      // 1000Hz と 1500Hz の高周波アラート音（人の耳が最も敏感な帯域）
      [0, 0.18, 0.36].forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square'; // 明瞭な電子音
        osc.frequency.setValueAtTime(idx % 2 === 0 ? 1200 : 1600, now + delay);

        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.4, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.14);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + delay);
        osc.stop(now + delay + 0.15);
      });
    }
  } catch (e) {
    console.warn('Audio alert error:', e);
  }

  // スマホのバイブレーション（Vibration API）
  if (APP_STATE.settings.vibrate && 'vibrate' in navigator) {
    try {
      // 300ms振動、100ms休止、300ms振動、100ms休止、500ms強振動
      navigator.vibrate([300, 100, 300, 100, 500]);
    } catch (e) {
      console.warn('Vibration blocked:', e);
    }
  }
}

// ----------------------------------------------------
// 2. 時計機能
// ----------------------------------------------------
function updateClock() {
  const now = new Date();
  if (APP_STATE.settings.showDate) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dow = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
    document.getElementById('clock-date').textContent = `${year}年${month}月${day}日 (${dow})`;
    document.getElementById('clock-date').classList.remove('hidden');
  } else {
    document.getElementById('clock-date').classList.add('hidden');
  }

  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  if (APP_STATE.settings.showSeconds) {
    const s = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock-time').textContent = `${h}:${m}:${s}`;
  } else {
    document.getElementById('clock-time').textContent = `${h}:${m}`;
  }
}

// ----------------------------------------------------
// 3. ストップウォッチ
// ----------------------------------------------------
function formatTime(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function startStopwatch() {
  if (APP_STATE.stopwatch.running) return;
  APP_STATE.stopwatch.running = true;
  APP_STATE.stopwatch.startTime = performance.now() - APP_STATE.stopwatch.elapsedTime;
  APP_STATE.stopwatch.timerId = setInterval(() => {
    APP_STATE.stopwatch.elapsedTime = performance.now() - APP_STATE.stopwatch.startTime;
    document.getElementById('sw-time').textContent = formatTime(APP_STATE.stopwatch.elapsedTime);
  }, 10);

  document.getElementById('sw-start-btn').disabled = true;
  document.getElementById('sw-pause-btn').disabled = false;
  document.getElementById('sw-lap-btn').disabled = false;
  document.getElementById('sw-reset-btn').disabled = false;
}

function pauseStopwatch() {
  if (!APP_STATE.stopwatch.running) return;
  APP_STATE.stopwatch.running = false;
  clearInterval(APP_STATE.stopwatch.timerId);
  document.getElementById('sw-start-btn').disabled = false;
  document.getElementById('sw-pause-btn').disabled = true;
  document.getElementById('sw-lap-btn').disabled = true;
}

function resetStopwatch() {
  pauseStopwatch();
  APP_STATE.stopwatch.elapsedTime = 0;
  APP_STATE.stopwatch.laps = [];
  document.getElementById('sw-time').textContent = '00:00.00';
  document.getElementById('sw-lap-list').innerHTML = '';
  document.getElementById('sw-reset-btn').disabled = true;
  document.getElementById('sw-lap-btn').disabled = true;
}

function recordLap() {
  if (!APP_STATE.stopwatch.running) return;
  const current = APP_STATE.stopwatch.elapsedTime;
  const last = APP_STATE.stopwatch.laps.length > 0 ? APP_STATE.stopwatch.laps[APP_STATE.stopwatch.laps.length - 1].total : 0;
  const lapTime = current - last;
  const num = APP_STATE.stopwatch.laps.length + 1;
  APP_STATE.stopwatch.laps.push({ number: num, lap: lapTime, total: current });

  const tr = document.createElement('tr');
  tr.innerHTML = `<td>#${num}</td><td>${formatTime(lapTime)}</td><td>${formatTime(current)}</td>`;
  document.getElementById('sw-lap-list').insertBefore(tr, document.getElementById('sw-lap-list').firstChild);
}

// ----------------------------------------------------
// 4. アラーム（一括同期機能付き）
// ----------------------------------------------------
function saveAlarmsToStorage() {
  const data = APP_STATE.alarms.map(a => ({
    id: a.id,
    label: a.label,
    intervalMs: a.intervalMs,
    running: a.running
  }));
  localStorage.setItem('clock_alarms', JSON.stringify(data));
}

function loadAlarmsFromStorage() {
  const data = localStorage.getItem('clock_alarms');
  if (data) {
    try {
      const parsed = JSON.parse(data);
      const now = Date.now();
      APP_STATE.alarms = parsed.map(item => ({
        id: item.id || Date.now().toString(),
        label: item.label,
        intervalMs: item.intervalMs,
        running: item.running || false,
        nextTrigger: item.running ? now + item.intervalMs : null
      }));
    } catch (e) {
      APP_STATE.alarms = [];
    }
  }
}

function renderAlarmList() {
  const container = document.getElementById('alarm-list');
  container.innerHTML = '';

  if (APP_STATE.alarms.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:1rem;">登録されたアラームはありません</p>';
    return;
  }

  APP_STATE.alarms.forEach(alarm => {
    const div = document.createElement('div');
    div.className = `alarm-item ${alarm.running ? 'active' : ''}`;
    div.id = `alarm-item-${alarm.id}`;

    const totalSec = Math.floor(alarm.intervalMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const intervalStr = `${m > 0 ? `${m}分` : ''}${s > 0 ? `${s}秒` : ''}`;

    div.innerHTML = `
      <div class="alarm-item-info">
        <div class="alarm-item-title">${escapeHtml(alarm.label)} (${intervalStr}ごと)</div>
        <div class="alarm-item-countdown" id="countdown-${alarm.id}">
          状態: ${alarm.running ? '稼働中' : '停止中'}
        </div>
      </div>
      <div class="alarm-item-controls">
        <button class="btn btn-secondary toggle-alarm-btn" data-id="${alarm.id}">
          ${alarm.running ? '停止' : '開始'}
        </button>
        <button class="btn btn-danger delete-alarm-btn" data-id="${alarm.id}">削除</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function updateAlarmCountdowns() {
  const now = Date.now();
  APP_STATE.alarms.forEach(alarm => {
    if (!alarm.running) return;

    if (now >= alarm.nextTrigger) {
      triggerAlarm(alarm);
      alarm.nextTrigger = now + alarm.intervalMs;
    }

    const remainMs = Math.max(0, alarm.nextTrigger - now);
    const remainSec = Math.ceil(remainMs / 1000);
    const m = Math.floor(remainSec / 60);
    const s = remainSec % 60;
    const cdElem = document.getElementById(`countdown-${alarm.id}`);
    if (cdElem) {
      cdElem.textContent = `次回まで: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  });
}

// 一括開始：全イベントのカウントダウンを「今この瞬間」から同一同期
function startAllAlarms() {
  if (APP_STATE.alarms.length === 0) return;
  const syncBaseTime = Date.now();
  APP_STATE.alarms.forEach(alarm => {
    alarm.running = true;
    alarm.nextTrigger = syncBaseTime + alarm.intervalMs;
  });
  saveAlarmsToStorage();
  renderAlarmList();
}

// 一括停止
function stopAllAlarms() {
  APP_STATE.alarms.forEach(alarm => {
    alarm.running = false;
    alarm.nextTrigger = null;
  });
  saveAlarmsToStorage();
  renderAlarmList();
}

function triggerAlarm(alarm) {
  playAlarmAlert();

  // 周辺視野ストロボ枠を表示
  document.getElementById('flash-frame').classList.remove('hidden');

  // モーダル表示
  const modal = document.getElementById('alarm-overlay');
  document.getElementById('alarm-modal-message').textContent = `【${alarm.label}】`;
  modal.classList.remove('hidden');

  // ブラウザー通知
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('【アラーム通知】', {
        body: `設定した「${alarm.label}」の時間になりました！`,
        icon: 'icon.svg'
      });
    } catch (e) {}
  }
}

function dismissAlarm() {
  document.getElementById('flash-frame').classList.add('hidden');
  document.getElementById('alarm-overlay').classList.add('hidden');
  if ('vibrate' in navigator) navigator.vibrate(0); // 振動停止
}

// ----------------------------------------------------
// 5. ダーク/ライト自動判別 & テーマ反映
// ----------------------------------------------------
function getEffectiveTheme() {
  if (APP_STATE.settings.theme === 'auto') {
    // OS・ブラウザーのダークモード判定
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isDark ? 'dark' : 'light';
  }
  return APP_STATE.settings.theme;
}

function applyTheme() {
  const activeTheme = getEffectiveTheme();
  document.body.dataset.theme = activeTheme;

  // meta theme-color も連動
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', activeTheme === 'dark' ? '#0b1120' : '#f8fafc');
  }
}

function saveSettings() {
  localStorage.setItem('clock_settings', JSON.stringify(APP_STATE.settings));
}

function applySettings() {
  applyTheme();
  document.body.dataset.clockSize = APP_STATE.settings.clockSize;

  document.getElementById('section-clock').classList.toggle('hidden', !APP_STATE.settings.sections.clock);
  document.getElementById('section-stopwatch').classList.toggle('hidden', !APP_STATE.settings.sections.stopwatch);
  document.getElementById('section-alarm').classList.toggle('hidden', !APP_STATE.settings.sections.alarm);

  document.getElementById('setting-theme').value = APP_STATE.settings.theme;
  document.getElementById('setting-clock-size').value = APP_STATE.settings.clockSize;
  document.getElementById('setting-vibrate').checked = APP_STATE.settings.vibrate;
  document.getElementById('setting-show-date').checked = APP_STATE.settings.showDate;
  document.getElementById('setting-show-seconds').checked = APP_STATE.settings.showSeconds;
  document.getElementById('setting-show-clock-section').checked = APP_STATE.settings.sections.clock;
  document.getElementById('setting-show-stopwatch-section').checked = APP_STATE.settings.sections.stopwatch;
  document.getElementById('setting-show-alarm-section').checked = APP_STATE.settings.sections.alarm;
}

function loadSettings() {
  const data = localStorage.getItem('clock_settings');
  if (data) {
    try {
      APP_STATE.settings = { ...APP_STATE.settings, ...JSON.parse(data) };
    } catch (e) {}
  }
  applySettings();
}

// OSのダークモード切り替えを動的に監視
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (APP_STATE.settings.theme === 'auto') {
      applyTheme();
    }
  });
}

// Wake Lock（画面点灯維持）
async function toggleWakeLock() {
  const btn = document.getElementById('toggle-wakelock-btn');
  const badge = document.getElementById('wakelock-status');

  if (!('wakeLock' in navigator)) {
    alert('このブラウザーは画面点灯維持API（Wake Lock）に対応していません。');
    return;
  }

  if (APP_STATE.wakeLock) {
    await APP_STATE.wakeLock.release();
    APP_STATE.wakeLock = null;
    badge.textContent = 'オフ';
    badge.classList.remove('active');
    btn.textContent = '画面点灯を維持する';
  } else {
    try {
      APP_STATE.wakeLock = await navigator.wakeLock.request('screen');
      badge.textContent = '維持中';
      badge.classList.add('active');
      btn.textContent = '画面維持を解除する';
      APP_STATE.wakeLock.addEventListener('release', () => {
        APP_STATE.wakeLock = null;
        badge.textContent = 'オフ';
        badge.classList.remove('active');
        btn.textContent = '画面点灯を維持する';
      });
    } catch (e) {}
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
}

// ----------------------------------------------------
// 初期化とイベント配線
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadAlarmsFromStorage();
  renderAlarmList();

  updateClock();
  setInterval(updateClock, 1000);
  setInterval(updateAlarmCountdowns, 100);

  // ストップウォッチ
  document.getElementById('sw-start-btn').addEventListener('click', startStopwatch);
  document.getElementById('sw-pause-btn').addEventListener('click', pauseStopwatch);
  document.getElementById('sw-reset-btn').addEventListener('click', resetStopwatch);
  document.getElementById('sw-lap-btn').addEventListener('click', recordLap);

  // アラーム登録
  document.getElementById('alarm-create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const label = document.getElementById('alarm-label').value.trim();
    const min = parseInt(document.getElementById('alarm-min').value, 10) || 0;
    const sec = parseInt(document.getElementById('alarm-sec').value, 10) || 0;
    const totalMs = (min * 60 + sec) * 1000;

    if (totalMs < 1000) {
      alert('1秒以上の間隔を指定してください。');
      return;
    }

    APP_STATE.alarms.push({
      id: Date.now().toString(),
      label: label || 'タイマー',
      intervalMs: totalMs,
      running: true,
      nextTrigger: Date.now() + totalMs
    });
    saveAlarmsToStorage();
    renderAlarmList();
    document.getElementById('alarm-label').value = '';
  });

  // 一括操作ボタン
  document.getElementById('bulk-start-btn').addEventListener('click', startAllAlarms);
  document.getElementById('bulk-stop-btn').addEventListener('click', stopAllAlarms);

  // アラーム個別の開始/停止/削除
  document.getElementById('alarm-list').addEventListener('click', (e) => {
    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains('toggle-alarm-btn')) {
      const target = APP_STATE.alarms.find(a => a.id === id);
      if (target) {
        target.running = !target.running;
        target.nextTrigger = target.running ? Date.now() + target.intervalMs : null;
        saveAlarmsToStorage();
        renderAlarmList();
      }
    } else if (e.target.classList.contains('delete-alarm-btn')) {
      APP_STATE.alarms = APP_STATE.alarms.filter(a => a.id !== id);
      saveAlarmsToStorage();
      renderAlarmList();
    }
  });

  document.getElementById('dismiss-alarm-btn').addEventListener('click', dismissAlarm);

  // 通知許可
  document.getElementById('request-notify-btn').addEventListener('click', async () => {
    if (!('Notification' in window)) {
      alert('このブラウザーは通知機能に対応していません。');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') alert('通知が許可されました。');
  });

  // 設定パネル
  document.getElementById('toggle-display-settings-btn').addEventListener('click', () => {
    document.getElementById('display-settings-panel').classList.toggle('hidden');
  });

  document.getElementById('setting-theme').addEventListener('change', (e) => {
    APP_STATE.settings.theme = e.target.value;
    applyTheme();
    saveSettings();
  });

  document.getElementById('setting-clock-size').addEventListener('change', (e) => {
    APP_STATE.settings.clockSize = e.target.value;
    applySettings();
    saveSettings();
  });

  document.getElementById('setting-vibrate').addEventListener('change', (e) => {
    APP_STATE.settings.vibrate = e.target.checked;
    saveSettings();
  });

  document.getElementById('setting-show-date').addEventListener('change', (e) => {
    APP_STATE.settings.showDate = e.target.checked;
    updateClock();
    saveSettings();
  });

  document.getElementById('setting-show-seconds').addEventListener('change', (e) => {
    APP_STATE.settings.showSeconds = e.target.checked;
    updateClock();
    saveSettings();
  });

  ['clock', 'stopwatch', 'alarm'].forEach(sec => {
    document.getElementById(`setting-show-${sec}-section`).addEventListener('change', (e) => {
      APP_STATE.settings.sections[sec] = e.target.checked;
      applySettings();
      saveSettings();
    });
  });

  document.getElementById('toggle-wakelock-btn').addEventListener('click', toggleWakeLock);

  document.getElementById('clear-storage-btn').addEventListener('click', () => {
    if (confirm('保存された設定とアラーム一覧を初期化しますか？')) {
      localStorage.clear();
      location.reload();
    }
  });
});

// Service Worker 登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  });
}
