// アプリケーション全体の状態管理
const APP_STATE = {
  settings: {
    theme: 'dark',
    clockSize: 'normal',
    showDate: true,
    showSeconds: true,
    sections: {
      clock: true,
      stopwatch: true,
      alarm: true
    }
  },
  alarms: [], // 登録されたアラーム設定
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

// Web Audio APIによるアラーム発火電子音（外部ファイル不要）
function playAlarmSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    
    if (!APP_STATE.audioCtx) {
      APP_STATE.audioCtx = new AudioContextClass();
    }
    if (APP_STATE.audioCtx.state === 'suspended') {
      APP_STATE.audioCtx.resume();
    }

    const ctx = APP_STATE.audioCtx;
    const now = ctx.currentTime;
    
    // 3連ビープ音（ピ・ピ・ピ）の生成
    [0, 0.15, 0.3].forEach(delay => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now + delay); // A5ノート (880Hz)
      
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.13);
    });
  } catch (err) {
    console.warn('オーディオ再生が制限されました:', err);
  }
}

// ----------------------------------------------------
// 1. 時計機能（端末システム時刻）
// ----------------------------------------------------
function updateClock() {
  const now = new Date();
  
  if (APP_STATE.settings.showDate) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
    const dow = daysOfWeek[now.getDay()];
    document.getElementById('clock-date').textContent = `${year}年${month}月${day}日 (${dow})`;
    document.getElementById('clock-date').classList.remove('hidden');
  } else {
    document.getElementById('clock-date').classList.add('hidden');
  }

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  if (APP_STATE.settings.showSeconds) {
    const seconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock-time').textContent = `${hours}:${minutes}:${seconds}`;
  } else {
    document.getElementById('clock-time').textContent = `${hours}:${minutes}`;
  }
}

// ----------------------------------------------------
// 2. ストップウォッチ機能
// ----------------------------------------------------
function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
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
  const currentTotal = APP_STATE.stopwatch.elapsedTime;
  const lastTotal = APP_STATE.stopwatch.laps.length > 0 
    ? APP_STATE.stopwatch.laps[APP_STATE.stopwatch.laps.length - 1].total 
    : 0;
  const lapDuration = currentTotal - lastTotal;
  
  const lapNumber = APP_STATE.stopwatch.laps.length + 1;
  APP_STATE.stopwatch.laps.push({ number: lapNumber, lap: lapDuration, total: currentTotal });

  const tbody = document.getElementById('sw-lap-list');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>#${lapNumber}</td>
    <td>${formatTime(lapDuration)}</td>
    <td>${formatTime(currentTotal)}</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);
}

// ----------------------------------------------------
// 3. インターバルアラーム機能
// ----------------------------------------------------
function saveAlarmsToStorage() {
  const serializable = APP_STATE.alarms.map(a => ({
    id: a.id,
    label: a.label,
    intervalMs: a.intervalMs,
    running: a.running
  }));
  localStorage.setItem('clock_alarms', JSON.stringify(serializable));
}

function loadAlarmsFromStorage() {
  const data = localStorage.getItem('clock_alarms');
  if (data) {
    try {
      const parsed = JSON.parse(data);
      APP_STATE.alarms = parsed.map(item => ({
        id: item.id || Date.now().toString(),
        label: item.label,
        intervalMs: item.intervalMs,
        running: item.running || false,
        nextTrigger: item.running ? Date.now() + item.intervalMs : null
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
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">登録されたアラームはありません</p>';
    return;
  }

  APP_STATE.alarms.forEach(alarm => {
    const div = document.createElement('div');
    div.className = 'alarm-item';
    div.dataset.id = alarm.id;

    const intervalSec = Math.floor(alarm.intervalMs / 1000);
    const m = Math.floor(intervalSec / 60);
    const s = intervalSec % 60;
    const intervalStr = `${m > 0 ? `${m}分` : ''}${s > 0 ? `${s}秒` : ''}`;

    div.innerHTML = `
      <div class="alarm-item-info">
        <div class="alarm-item-title">${escapeHtml(alarm.label)} (${intervalStr}ごと)</div>
        <div class="alarm-item-countdown" id="countdown-${alarm.id}">
          状態: ${alarm.running ? '稼働中 (計算中...)' : '停止中'}
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
      alarm.nextTrigger = now + alarm.intervalMs; // 次のインターバルをセット
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

function triggerAlarm(alarm) {
  // 1. 音声
  playAlarmSound();

  // 2. 視覚的点滅
  document.body.classList.add('alarm-flashing');

  // 3. 画面内モーダルダイアログ
  const modal = document.getElementById('alarm-overlay');
  const msg = document.getElementById('alarm-modal-message');
  msg.textContent = `【${alarm.label}】の時間です！`;
  modal.classList.remove('hidden');

  // 4. ブラウザー通知（許可されている場合）
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('マルチタイマ＆クロック', {
        body: `【${alarm.label}】の設定時間になりました。`,
        icon: 'icon.svg'
      });
    } catch (e) {
      // 一部環境での通知エラーをキャッチ
    }
  }
}

function dismissAlarm() {
  document.body.classList.remove('alarm-flashing');
  document.getElementById('alarm-overlay').classList.add('hidden');
}

// ----------------------------------------------------
// 4. 設定の保存と読み込み
// ----------------------------------------------------
function saveSettings() {
  localStorage.setItem('clock_settings', JSON.stringify(APP_STATE.settings));
}

function applySettings() {
  const s = APP_STATE.settings;
  document.body.dataset.theme = s.theme;
  document.body.dataset.clockSize = s.clockSize;

  document.getElementById('section-clock').classList.toggle('hidden', !s.sections.clock);
  document.getElementById('section-stopwatch').classList.toggle('hidden', !s.sections.stopwatch);
  document.getElementById('section-alarm').classList.toggle('hidden', !s.sections.alarm);

  document.getElementById('setting-theme').value = s.theme;
  document.getElementById('setting-clock-size').value = s.clockSize;
  document.getElementById('setting-show-date').checked = s.showDate;
  document.getElementById('setting-show-seconds').checked = s.showSeconds;
  document.getElementById('setting-show-clock-section').checked = s.sections.clock;
  document.getElementById('setting-show-stopwatch-section').checked = s.sections.stopwatch;
  document.getElementById('setting-show-alarm-section').checked = s.sections.alarm;
}

function loadSettings() {
  const data = localStorage.getItem('clock_settings');
  if (data) {
    try {
      const parsed = JSON.parse(data);
      APP_STATE.settings = { ...APP_STATE.settings, ...parsed };
    } catch (e) {}
  }
  applySettings();
}

// 画面常時点灯（Screen Wake Lock API）
async function toggleWakeLock() {
  const btn = document.getElementById('toggle-wakelock-btn');
  const badge = document.getElementById('wakelock-status');

  if (!('wakeLock' in navigator)) {
    alert('お使いのブラウザーは画面点灯維持（Screen Wake Lock API）に対応していません。');
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
    } catch (err) {
      console.warn('Wake Lock request error:', err);
    }
  }
}

// ユーティリティ
function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// ----------------------------------------------------
// イベントリスナー登録と初期化
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadAlarmsFromStorage();
  renderAlarmList();

  // 時計更新（毎秒）
  updateClock();
  setInterval(updateClock, 1000);

  // アラーム監視（100ms周期）
  setInterval(updateAlarmCountdowns, 100);

  // ストップウォッチ操作
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

    const newAlarm = {
      id: Date.now().toString(),
      label: label || 'タイマー',
      intervalMs: totalMs,
      running: true,
      nextTrigger: Date.now() + totalMs
    };

    APP_STATE.alarms.push(newAlarm);
    saveAlarmsToStorage();
    renderAlarmList();
    document.getElementById('alarm-label').value = '';
  });

  // アラームリスト内クリック操作（委任）
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

  // アラーム停止ボタン
  document.getElementById('dismiss-alarm-btn').addEventListener('click', dismissAlarm);

  // 通知許可要求
  document.getElementById('request-notify-btn').addEventListener('click', async () => {
    if (!('Notification' in window)) {
      alert('お使いのブラウザーはWeb Notificationsに対応していません。');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      alert('通知が許可されました。アラーム時にデスクトップ通知が送信されます。');
    } else {
      alert('通知は許可されませんでした。アプリ画面内の通知・点滅・音で知らせます。');
    }
  });

  // 表示設定パネル開閉
  document.getElementById('toggle-display-settings-btn').addEventListener('click', () => {
    document.getElementById('display-settings-panel').classList.toggle('hidden');
  });

  // 設定変更の反映
  document.getElementById('setting-theme').addEventListener('change', (e) => {
    APP_STATE.settings.theme = e.target.value;
    applySettings();
    saveSettings();
  });

  document.getElementById('setting-clock-size').addEventListener('change', (e) => {
    APP_STATE.settings.clockSize = e.target.value;
    applySettings();
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
    const cap = sec.charAt(0).toUpperCase() + sec.slice(1);
    document.getElementById(`setting-show-${sec}-section`).addEventListener('change', (e) => {
      APP_STATE.settings.sections[sec] = e.target.checked;
      applySettings();
      saveSettings();
    });
  });

  // 画面点灯維持
  document.getElementById('toggle-wakelock-btn').addEventListener('click', toggleWakeLock);

  // ローカルデータ消去
  document.getElementById('clear-storage-btn').addEventListener('click', () => {
    if (confirm('ローカルに保存されているアラーム設定と表示設定を全てリセットしますか？')) {
      localStorage.removeItem('clock_settings');
      localStorage.removeItem('clock_alarms');
      location.reload();
    }
  });
});

// ----------------------------------------------------
// 5. Service Worker 登録（GitHub Pages相対パス考慮）
// ----------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('ServiceWorker registered with scope:', reg.scope);
      })
      .catch(err => {
        console.error('ServiceWorker registration failed:', err);
      });
  });
}