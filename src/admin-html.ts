export function getAdminHtml(gatewayToken: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Admin</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'cf-orange': '#F6821F',
        'cf-dark': '#1b1b1b',
      }
    }
  }
}
</script>
<style>
  .toast { animation: slideIn 0.3s ease, fadeOut 0.3s ease 2.7s; }
  @keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } }
  @keyframes fadeOut { to { opacity: 0; } }
  table { border-collapse: separate; border-spacing: 0; }
  th { background: #f9fafb; }
  td, th { padding: 10px 14px; text-align: left; border-bottom: 1px solid #f3f4f6; }
  tr:hover td { background: #fefce8; }
  .tab-btn { transition: all 0.15s; }
  .tab-btn.active { color: #F6821F; border-bottom: 2px solid #F6821F; }
  .tab-btn:not(.active) { color: #6b7280; border-bottom: 2px solid transparent; }
  .tab-btn:not(.active):hover { color: #374151; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .term-output { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; }
  .term-output::-webkit-scrollbar { width: 6px; }
  .term-output::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
</style>
</head>
<body class="bg-gray-50 text-gray-800 min-h-screen">

<!-- Nav bar -->
<nav class="bg-white border-b border-gray-100 shadow-sm">
  <div class="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-cf-orange text-white font-bold text-lg">O</div>
      <div>
        <h1 class="text-lg font-bold tracking-tight text-cf-dark">OpenClaw Admin</h1>
        <p class="text-xs text-gray-400">Cloudflare Containers + Workers AI</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <a href="/#token=\${gatewayToken}" class="inline-flex items-center gap-1.5 rounded-xl bg-cf-orange px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
        Open Chat
      </a>
      <button onclick="restartGateway()" id="restart-btn" class="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-red-300 hover:text-red-600">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        Restart
      </button>
      <div class="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm">
        <span class="h-2 w-2 rounded-full bg-gray-400" id="status-dot"></span>
        <span id="status-text" class="text-gray-500">Checking...</span>
      </div>
    </div>
  </div>
</nav>

<div class="mx-auto max-w-5xl px-6 py-6">
  <!-- Tabs -->
  <div class="flex gap-1 border-b border-gray-200 mb-6">
    <button class="tab-btn active px-4 py-2.5 text-sm font-medium" onclick="switchTab('overview')">Overview</button>
    <button class="tab-btn px-4 py-2.5 text-sm font-medium" onclick="switchTab('devices')">Devices</button>
    <button class="tab-btn px-4 py-2.5 text-sm font-medium" onclick="switchTab('cli')">CLI</button>
  </div>

  <!-- ============ TAB: OVERVIEW ============ -->
  <div id="tab-overview" class="tab-panel active">
    <!-- Stats cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-cf-orange/30 hover:shadow-lg">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-cf-orange mb-3">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Uptime</p>
        <p class="mt-1 text-xl font-bold text-cf-dark" id="stat-uptime">--</p>
      </div>
      <div class="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-cf-orange/30 hover:shadow-lg">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-cf-orange mb-3">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z"/></svg>
        </div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">CPU Load</p>
        <p class="mt-1 text-xl font-bold text-cf-dark" id="stat-cpu">--</p>
      </div>
      <div class="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-cf-orange/30 hover:shadow-lg">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-cf-orange mb-3">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>
        </div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Memory</p>
        <p class="mt-1 text-xl font-bold text-cf-dark" id="stat-mem">--</p>
      </div>
      <div class="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-cf-orange/30 hover:shadow-lg">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-cf-orange mb-3">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg>
        </div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">R2 Snapshot</p>
        <p class="mt-1 text-xl font-bold text-cf-dark" id="stat-kv">--</p>
      </div>
    </div>

    <!-- Container Info -->
    <div class="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-cf-dark mb-4">Container Info</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <span class="text-gray-400 w-28 shrink-0">Image</span>
          <span class="font-mono text-xs text-cf-dark">docker.io/alpine/openclaw:main</span>
        </div>
        <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <span class="text-gray-400 w-28 shrink-0">Instance</span>
          <span class="text-cf-dark">standard-2 (2 vCPU, 6 GB RAM)</span>
        </div>
        <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <span class="text-gray-400 w-28 shrink-0">Port</span>
          <span class="text-cf-dark">18789</span>
        </div>
        <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <span class="text-gray-400 w-28 shrink-0">Model</span>
          <span class="text-cf-dark">Kimi K2.5 (Workers AI)</span>
        </div>
        <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <span class="text-gray-400 w-28 shrink-0">AI Gateway</span>
          <span class="text-cf-dark" id="info-gateway">--</span>
        </div>
        <div class="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <span class="text-gray-400 w-28 shrink-0">Max Instances</span>
          <span class="text-cf-dark">1</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ TAB: DEVICES ============ -->
  <div id="tab-devices" class="tab-panel">
    <div class="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm mb-5">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-cf-dark">Pending Pairing Requests</h2>
        <div class="flex gap-2">
          <button onclick="approveAll()" id="approve-all-btn" class="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-600 hidden">Approve All</button>
          <button onclick="loadDevices(true)" class="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-cf-orange/30">Refresh</button>
        </div>
      </div>
      <div id="pending-content"><div class="text-center py-6 text-gray-400 text-sm">Loading...</div></div>
    </div>

    <div class="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-cf-dark mb-4">Paired Devices</h2>
      <div id="paired-content"><div class="text-center py-6 text-gray-400 text-sm">Loading...</div></div>
    </div>
  </div>

  <!-- ============ TAB: CLI ============ -->
  <div id="tab-cli" class="tab-panel">
    <div class="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-cf-dark">Container CLI</h2>
        <button onclick="clearTerminal()" class="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-cf-orange/30">Clear</button>
      </div>
      <div id="term-output" class="term-output bg-gray-900 rounded-xl p-4 h-[400px] overflow-y-auto text-sm text-green-400 mb-4 whitespace-pre-wrap">Welcome to OpenClaw Container CLI.\\nType a command and press Enter.\\n\\n</div>
      <div class="flex gap-2">
        <span class="text-cf-orange font-mono text-sm py-2.5 font-bold">$</span>
        <input id="term-input" type="text" class="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-mono text-cf-dark focus:outline-none focus:border-cf-orange focus:ring-1 focus:ring-cf-orange/30 transition" placeholder="Enter command..." onkeydown="handleTermKey(event)" autocomplete="off" spellcheck="false">
        <button onclick="runTermCmd()" class="rounded-xl bg-cf-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600">Run</button>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button onclick="quickCmd('node dist/index.js devices list')" class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-cf-orange/30 hover:text-cf-orange">devices list</button>
        <button onclick="quickCmd('cat /home/node/.openclaw/openclaw.json')" class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-cf-orange/30 hover:text-cf-orange">show config</button>
        <button onclick="quickCmd('ps aux --sort=-%mem | head -10')" class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-cf-orange/30 hover:text-cf-orange">top processes</button>
        <button onclick="quickCmd('du -sh /home/node/.openclaw/*')" class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-cf-orange/30 hover:text-cf-orange">disk usage</button>
        <button onclick="quickCmd('ls -la /home/node/.openclaw/')" class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 transition hover:border-cf-orange/30 hover:text-cf-orange">list files</button>
        <button onclick="saveToR2()" class="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-600 font-medium transition hover:border-green-400 hover:bg-green-100">Save to R2</button>
      </div>
    </div>
  </div>
</div>

<!-- Footer -->
<footer class="border-t border-gray-100 bg-white mt-12">
  <div class="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between">
    <p class="text-xs text-gray-400">OpenClaw Admin &mdash; Powered by Cloudflare</p>
    <div class="flex gap-4">
      <a href="https://developers.cloudflare.com/containers/" target="_blank" class="text-xs text-gray-400 transition hover:text-cf-orange">Containers Docs</a>
      <a href="https://github.com/lllxpr/openclaw-cloudflare-container" target="_blank" class="text-xs text-gray-400 transition hover:text-cf-orange">GitHub</a>
    </div>
  </div>
</footer>

<!-- Toast container -->
<div id="toast-container" class="fixed top-4 right-4 flex flex-col gap-2 z-50"></div>

<script>
// ---- Tab management ----
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
  if (name === 'devices') loadDevices();
}

// ---- Toast ----
function showToast(msg, type = 'info') {
  const colors = { info: 'bg-blue-500', success: 'bg-green-500', error: 'bg-red-500', warn: 'bg-amber-500' };
  const el = document.createElement('div');
  el.className = 'toast px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-lg ' + (colors[type] || colors.info);
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---- Status + Stats ----
async function loadStatus() {
  try {
    const r = await fetch('/healthz');
    const d = await r.json();
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (d.ok) {
      dot.className = 'h-2 w-2 rounded-full bg-green-500';
      txt.textContent = 'Live'; txt.className = 'text-green-600 font-medium';
    } else {
      dot.className = 'h-2 w-2 rounded-full bg-red-500';
      txt.textContent = 'Down'; txt.className = 'text-red-600 font-medium';
    }
  } catch {
    document.getElementById('status-dot').className = 'h-2 w-2 rounded-full bg-red-500';
    const txt = document.getElementById('status-text');
    txt.textContent = 'Unreachable'; txt.className = 'text-red-500';
  }
}

function fmtBytes(b) { if (b > 1e9) return (b/1e9).toFixed(1)+'G'; if (b > 1e6) return (b/1e6).toFixed(0)+'M'; return (b/1e3).toFixed(0)+'K'; }
function fmtUptime(s) { const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); return h > 0 ? h+'h '+m+'m' : m+'m'; }

async function loadStats() {
  try {
    const r = await fetch('/admin/api/stats');
    const d = JSON.parse(await r.text());
    document.getElementById('stat-uptime').textContent = fmtUptime(d.uptime);
    document.getElementById('stat-cpu').textContent = d.loadAvg[0].toFixed(2);
    const usedMem = d.totalMem - d.freeMem;
    document.getElementById('stat-mem').textContent = fmtBytes(usedMem) + ' / ' + fmtBytes(d.totalMem);
  } catch {}
  try {
    const r = await fetch('/persist/status');
    const d = await r.json();
    document.getElementById('stat-kv').textContent = d.objects && d.objects.length > 0 ? d.objects.length + ' object(s)' : 'Empty';
  } catch {}
}

// ---- Devices ----
function parseDevicesTable(raw) {
  const pending = [], paired = [];
  let section = '';
  const lines = raw.split('\\n');
  for (const line of lines) {
    if (line.match(/Pending \\(/i)) section = 'pending';
    if (line.match(/Paired \\(/i)) section = 'paired';
    if (!section || !line.includes('\\u2502')) continue;
    if (line.includes('\\u2500\\u2500') || line.includes('Request') || line.includes('Device') && line.includes('Roles')) continue;
    const cells = line.split('\\u2502').map(s => s.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (section === 'pending' && cells[0].match(/[0-9a-f]{8}-/)) {
      pending.push({ requestId: cells[0], deviceId: cells[1]||'', role: cells[2]||'', scopes: cells[3]||'', ip: cells[4]||'', age: cells[5]||'' });
    }
    if (section === 'paired' && cells[0].match(/^[0-9a-f]{6,}/)) {
      paired.push({ deviceId: cells[0], role: cells[1]||'', scopes: cells[2]||'', tokens: cells[3]||'', ip: cells[4]||'' });
    }
  }
  return { pending, paired };
}

async function loadDevices(forceRefresh) {
  try {
    const url = forceRefresh ? '/admin/api/devices/refresh' : '/admin/api/devices';
    const r = await fetch(url);
    const raw = await r.text();
    const { pending, paired } = parseDevicesTable(raw);
    const pendingEl = document.getElementById('pending-content');
    const approveAllBtn = document.getElementById('approve-all-btn');
    if (pending.length === 0) {
      pendingEl.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">No pending requests</div>';
      approveAllBtn.classList.add('hidden');
    } else {
      approveAllBtn.classList.remove('hidden');
      pendingEl.innerHTML = '<div class="overflow-x-auto rounded-xl"><table class="w-full text-sm"><thead><tr class="text-gray-400 text-xs uppercase">' +
        '<th>Request ID</th><th>Device</th><th>Role</th><th>Scopes</th><th>Age</th><th>Actions</th></tr></thead><tbody>' +
        pending.map(d => '<tr><td class="font-mono text-xs text-cf-orange">' + d.requestId.substring(0,8) + '...</td>' +
          '<td class="font-mono text-xs text-gray-600">' + d.deviceId.substring(0,12) + '</td><td class="text-gray-700">' + d.role + '</td>' +
          '<td class="text-xs max-w-[200px] truncate text-gray-500">' + d.scopes + '</td><td class="text-gray-500">' + d.age + '</td>' +
          '<td><button onclick="approveDevice(\\''+d.requestId+'\\',this)" class="rounded-lg bg-green-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-600">Approve</button></td></tr>'
        ).join('') + '</tbody></table></div>';
    }
    const pairedEl = document.getElementById('paired-content');
    if (paired.length === 0) {
      pairedEl.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">No paired devices</div>';
    } else {
      pairedEl.innerHTML = '<div class="overflow-x-auto rounded-xl"><table class="w-full text-sm"><thead><tr class="text-gray-400 text-xs uppercase">' +
        '<th>Device</th><th>Role</th><th>Scopes</th><th>Tokens</th></tr></thead><tbody>' +
        paired.map(d => '<tr><td class="font-mono text-xs text-cf-orange">' + (d.deviceId.length>16?d.deviceId.substring(0,16)+'...':d.deviceId) + '</td>' +
          '<td class="text-gray-700">' + d.role + '</td><td class="text-xs max-w-[250px] text-gray-500">' + d.scopes + '</td><td class="text-xs text-gray-500">' + (d.tokens||'') + '</td></tr>'
        ).join('') + '</tbody></table></div>';
    }
  } catch (e) {
    document.getElementById('pending-content').innerHTML = '<div class="text-center py-6 text-red-500">Failed: ' + e.message + '</div>';
  }
}

async function approveDevice(requestId, btn) {
  btn.disabled = true; btn.textContent = '...';
  try {
    const r = await fetch('/admin/api/approve?id=' + requestId);
    if (r.ok) { showToast('Device approved', 'success'); setTimeout(() => loadDevices(true), 800); }
    else { showToast('Approve failed', 'error'); btn.disabled = false; btn.textContent = 'Approve'; }
  } catch (e) { showToast('Error: ' + e.message, 'error'); btn.disabled = false; btn.textContent = 'Approve'; }
}

async function approveAll() {
  const btn = document.getElementById('approve-all-btn');
  btn.disabled = true; btn.textContent = 'Approving...';
  try {
    await fetch('/admin/api/approve-all');
    showToast('All devices approved', 'success');
    setTimeout(() => loadDevices(true), 800);
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Approve All';
}

// ---- CLI Terminal ----
const cmdHistory = [];
let historyIdx = -1;

function appendTerm(text, cls) {
  const el = document.getElementById('term-output');
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text;
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}

function clearTerminal() {
  document.getElementById('term-output').innerHTML = '';
}

async function runTermCmd() {
  const input = document.getElementById('term-input');
  const cmd = input.value.trim();
  if (!cmd) return;
  cmdHistory.unshift(cmd);
  historyIdx = -1;
  input.value = '';
  appendTerm('$ ' + cmd + '\\n', 'text-amber-400');
  // Handle special commands that route to mgmt API
  if (cmd === '/save' || cmd === 'save') { await saveToR2(); return; }
  try {
    const r = await fetch('/admin/api/run?cmd=' + encodeURIComponent(cmd));
    const text = await r.text();
    appendTerm(text + '\\n', r.ok ? 'text-gray-300' : 'text-red-400');
  } catch (e) {
    appendTerm('Error: ' + e.message + '\\n', 'text-red-400');
  }
}

async function saveToR2() {
  try {
    appendTerm('Saving to R2...\\n', 'text-cyan-400');
    const r = await fetch('/admin/api/save');
    const text = await r.text();
    appendTerm(text + '\\n', r.ok ? 'text-green-400' : 'text-red-400');
    loadStats();
  } catch (e) {
    appendTerm('Save error: ' + e.message + '\\n', 'text-red-400');
  }
}

function quickCmd(cmd) {
  document.getElementById('term-input').value = cmd;
  runTermCmd();
}

function handleTermKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); runTermCmd(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); if (cmdHistory.length > 0) { historyIdx = Math.min(historyIdx+1, cmdHistory.length-1); e.target.value = cmdHistory[historyIdx]; } }
  if (e.key === 'ArrowDown') { e.preventDefault(); historyIdx = Math.max(historyIdx-1, -1); e.target.value = historyIdx >= 0 ? cmdHistory[historyIdx] : ''; }
}

// ---- Actions ----
async function restartGateway() {
  const btn = document.getElementById('restart-btn');
  if (!confirm('Restart the container? All connected clients will be disconnected.')) return;
  btn.disabled = true; btn.textContent = 'Restarting...';
  try {
    await fetch('/admin/restart');
    showToast('Restart triggered. Wait ~60s.', 'warn');
    document.getElementById('status-dot').className = 'h-2 w-2 rounded-full bg-yellow-500';
    document.getElementById('status-text').textContent = 'Restarting...';
    document.getElementById('status-text').className = 'text-amber-600 font-medium';
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch('/healthz', { signal: AbortSignal.timeout(5000) });
        if (r.ok) { clearInterval(poll); showToast('Back online!', 'success'); loadStatus(); loadStats(); btn.disabled = false; btn.innerHTML = '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Restart'; }
      } catch {}
      if (attempts > 30) { clearInterval(poll); showToast('Did not recover in time', 'error'); btn.disabled = false; btn.textContent = 'Restart'; }
    }, 5000);
  } catch (e) { showToast('Error: ' + e.message, 'error'); btn.disabled = false; btn.textContent = 'Restart'; }
}

// ---- Init ----
loadStatus();
loadStats();

// Refresh status + stats every 30s
setInterval(() => { loadStatus(); loadStats(); }, 30000);
</script>
</body>
</html>`;
}
