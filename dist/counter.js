const API = 'https://countapi.mileshilliard.com/api/v1';
const VISITOR_KEY = 'sstvlab_altunsumerve_visitors';
const ATTEMPT_KEY = 'sstvlab_altunsumerve_receive_attempts';
const VISITOR_FLAG = 'sstv-lab-visitor';

// Count only this project's published Pages site. Previews and forks must not
// inflate Merve's counters. Update this when moving to a custom domain.
const live = location.origin === 'https://altunsumerve.github.io' &&
  (location.pathname === '/sstv-lab' || location.pathname.startsWith('/sstv-lab/'));
let initialization;

function readFlag() {
  try { return localStorage.getItem(VISITOR_FLAG) === '1'; } catch { return false; }
}

function writeFlag() {
  try { localStorage.setItem(VISITOR_FLAG, '1'); } catch {}
}

async function call(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${API}/${path}`, {
      cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal
    });
    if (response.status === 404 && path.startsWith('get/')) return 0;
    if (!response.ok) throw new Error(`counter ${response.status}`);
    const data = await response.json();
    const raw = data.value;
    const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('counter payload');
    return value;
  } finally { clearTimeout(timer); }
}

function render(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value.toLocaleString('tr-TR');
}

export function initStats() {
  return initialization ??= loadStats();
}

async function loadStats() {
  const panel = document.getElementById('stats');
  if (!panel || !live) return;
  const returning = readFlag();
  try {
    const results = await Promise.allSettled([
      call(returning ? `get/${VISITOR_KEY}` : `hit/${VISITOR_KEY}`).then(value => {
        if (!returning) writeFlag();
        render('statVisitors', value);
      }),
      call(`get/${ATTEMPT_KEY}`).then(value => render('statAttempts', value))
    ]);
    panel.hidden = results.every(result => result.status === 'rejected');
  } catch {
    panel.hidden = true;
  }
}

export async function countReceiveAttempt() {
  if (!live) return;
  try {
    render('statAttempts', await call(`hit/${ATTEMPT_KEY}`));
  } catch {}
}
