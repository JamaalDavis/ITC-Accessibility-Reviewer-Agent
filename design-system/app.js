import { modes, definitions, contrast, exportTokens } from './tokens.js';
const $ = selector => document.querySelector(selector);
const storage = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } } };
let theme = storage.get('access-theme', 'light');
if (!Object.hasOwn(modes, theme)) theme = 'light';
let toastTimer;
function announce(text) { clearTimeout(toastTimer); $('#status').textContent = text; toastTimer = setTimeout(() => { $('#status').textContent = ''; }, 5000); }
function download(name, content) { const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); announce(`${name} exported.`); }
function renderTokens() {
  const palette = modes[theme], query = $('#token-search').value.toLowerCase();
  const rows = definitions.filter(([name, , description]) => `${name} ${description}`.toLowerCase().includes(query));
  $('#token-rows').innerHTML = rows.map(([name, key, description, partner, target]) => {
    const ratio = partner ? contrast(palette[key], palette[partner]) : null;
    return `<tr><td><code>${name}</code><small>${description}</small></td><td class="value"><span class="swatch" style="background:${palette[key]}" aria-hidden="true"></span><code>${palette[key]}</code></td><td>${partner ? `<code>${palette[partner]}</code><small>${partner}</small>` : '—'}</td><td>${ratio ? `<span class="${ratio >= target ? 'pass' : 'fail'}">${ratio >= target ? '✓' : '!'} ${ratio.toFixed(2)}:1</span>` : 'Surface'}</td><td>${target ? `${target}:1` : '—'}</td></tr>`;
  }).join('');
  $('#token-empty').hidden = rows.length !== 0;
  const pairs = definitions.filter(d => d[3]);
  const passed = pairs.filter(([, key, , partner, target]) => contrast(palette[key], palette[partner]) >= target).length;
  $('#pair-score').innerHTML = `${passed} / ${pairs.length}<small>meet their targets</small>`;
}
function setTheme(mode) { theme = mode; $('#theme').value = mode; document.documentElement.style.colorScheme = mode === 'light' ? 'light' : 'dark'; Object.entries(modes[mode]).forEach(([name, value]) => document.documentElement.style.setProperty(`--${name}`, value)); storage.set('access-theme', mode); renderTokens(); }
$('#theme').addEventListener('change', e => { setTheme(e.target.value); announce(`${e.target.selectedOptions[0].textContent} theme applied.`); });
$('#token-search').addEventListener('input', renderTokens);
document.querySelectorAll('.export').forEach(button => button.addEventListener('click', () => download(`access-tokens-${theme}.json`, exportTokens(theme))));
setTheme(theme);
const pages = ['overview', 'tokens', 'components', 'audits', 'docs'];
function navigate(focus = true) {
  const id = location.hash.slice(1);
  if (id === 'main') return;
  const page = pages.includes(id) ? id : 'overview';
  if (page !== 'components') { if (chatTimer || paused) finishChat('Stopped'); if (voiceMode !== 'idle') cancelVoice(false); }
  document.querySelectorAll('.page').forEach(section => { section.hidden = section.id !== page; });
  document.querySelectorAll('nav a').forEach(link => { if (link.dataset.page === page) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  $('#crumb').textContent = document.querySelector(`nav a[data-page="${page}"]`).childNodes[1].textContent;
  document.title = `${$('#crumb').textContent} — Access`;
  if (focus) { $('#main').focus(); window.scrollTo(0, 0); }
}
const sentences = ['Start with a native button element so keyboard activation and its role come built in.', ' Give it a clear, action-oriented name, such as “Save changes”.', ' Keep the target at least 44 by 44 CSS pixels in this design system, and leave room around adjacent controls.', ' Provide a visible focus outline and verify text and boundary contrast in every theme.', ' Finally, test it with a keyboard and a screen reader in the real product.'];
let chatTimer = null, paused = false, sentenceIndex = 0, wordIndex = 0, currentSentence = '';
function setChatState(state) { $('#chat-state').textContent = state; $('.chat-output').setAttribute('aria-busy', String(state === 'Streaming' || state === 'Paused')); }
function finishChat(state = 'Completed') { clearInterval(chatTimer); chatTimer = null; paused = false; setChatState(state); $('#pause').textContent = 'Pause'; $('#pause').disabled = true; $('#stop').disabled = true; $('#generate').disabled = false; $('#copy').disabled = !$('#response').textContent; if (state === 'Completed') announce(`Generation complete. ${$('#response').textContent.length} characters generated.`); }
function tick() {
  const words = sentences[sentenceIndex].split(' ');
  const word = (wordIndex ? ' ' : '') + words[wordIndex++];
  $('#response').textContent += word; currentSentence += word;
  if (wordIndex >= words.length) { $('#stream-announcement').textContent = currentSentence.trim(); currentSentence = ''; wordIndex = 0; sentenceIndex++; if (sentenceIndex >= sentences.length) finishChat(); }
}
function generate() { if (!$('#chat-form').reportValidity()) return; clearInterval(chatTimer); paused = false; sentenceIndex = 0; wordIndex = 0; currentSentence = ''; $('#response').textContent = ''; $('#stream-announcement').textContent = ''; setChatState('Streaming'); $('#pause').textContent = 'Pause'; $('#pause').disabled = false; $('#stop').disabled = false; $('#copy').disabled = true; announce('Prompt submitted. Generating a simulated button checklist.'); chatTimer = setInterval(tick, 90); }
$('#chat-form').addEventListener('submit', e => { e.preventDefault(); generate(); });
$('#retry').addEventListener('click', generate);
$('#pause').addEventListener('click', () => { paused = !paused; if (paused) { clearInterval(chatTimer); chatTimer = null; setChatState('Paused'); $('#pause').textContent = 'Resume'; announce('Generation paused.'); } else { setChatState('Streaming'); $('#pause').textContent = 'Pause'; chatTimer = setInterval(tick, 90); announce('Generation resumed.'); } });
$('#stop').addEventListener('click', () => { finishChat('Stopped'); $('#retry').focus(); announce('Generation stopped. You can copy or regenerate the response.'); });
$('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#response').textContent); announce('Response copied.'); } catch { announce('Clipboard unavailable. Select and copy the response text manually.'); } });
let voiceMode = 'idle', voiceTimer = null, transcribeTimer = null, elapsed = 0;
function voiceState(mode) { voiceMode = mode; $('#voice-state').textContent = mode[0].toUpperCase() + mode.slice(1); $('#voice-controller').classList.toggle('listening', mode === 'listening'); $('#mic').setAttribute('aria-pressed', String(mode === 'listening')); $('#mic').textContent = mode === 'listening' ? 'Stop voice demo' : mode === 'transcribing' ? 'Transcribing…' : 'Start voice demo'; $('#mic').disabled = mode === 'transcribing'; $('#voice-cancel').disabled = mode === 'idle'; $('#voice-done').disabled = mode !== 'listening'; }
function cancelVoice(focus = true) { clearInterval(voiceTimer); clearTimeout(transcribeTimer); voiceTimer = null; transcribeTimer = null; voiceState('idle'); $('#voice-text').textContent = 'Ready when you are'; $('#voice-time').textContent = '00:00'; $('#transcript').textContent = 'Your simulated transcript will appear here.'; if (focus) { $('#mic').focus(); announce('Voice demo cancelled. Simulated input discarded.'); } }
function doneVoice() { clearInterval(voiceTimer); voiceTimer = null; voiceState('transcribing'); $('#voice-cancel').focus(); $('#voice-text').textContent = 'Preparing simulated transcript…'; announce('Preparing simulated transcript.'); transcribeTimer = setTimeout(() => { voiceState('idle'); $('#voice-text').textContent = 'Demo complete'; $('#transcript').textContent = 'Simulated transcript: “Help me build a more accessible design system.”'; if ($('#components').contains(document.activeElement)) $('#mic').focus(); announce('Simulated transcription complete. Help me build a more accessible design system.'); }, 1000); }
$('#mic').addEventListener('click', () => { if (voiceMode === 'listening') { doneVoice(); return; } elapsed = 0; $('#voice-time').textContent = '00:00'; voiceState('listening'); $('#voice-text').textContent = 'Listening (simulation)'; $('#transcript').textContent = 'This demo uses a fixed sample transcript.'; announce('Voice demo active. No microphone is being recorded.'); voiceTimer = setInterval(() => { elapsed++; $('#voice-time').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`; }, 1000); });
$('#voice-cancel').addEventListener('click', () => cancelVoice());
$('#voice-done').addEventListener('click', doneVoice);
$('#voice-controller').addEventListener('keydown', e => { if (e.key === 'Escape' && voiceMode !== 'idle') { e.preventDefault(); cancelVoice(); } });
const checks = [
  ['keyboard', 'Keyboard navigation', 'Tab and Shift+Tab through each screen. Activate controls with Enter or Space; verify no traps and visible focus.'],
  ['stream', 'Screen reader: streaming response', 'Record your screen reader and browser. Generate, pause, resume, and stop; verify sentence announcements and busy state.'],
  ['voice', 'Screen reader: voice controller', 'Verify name and pressed state, start and finish the demo, and use Escape to cancel from inside the controller.'],
  ['zoom', 'Zoom & text spacing', 'Check 200% text zoom, a 320 CSS pixel viewport, and custom text spacing. Confirm content and controls remain usable.'],
  ['contrast', 'Themes & forced colors', 'Inspect all three themes and OS high contrast. Confirm labels, control boundaries, and focus indicators remain visible.'],
];
let audit = storage.get('access-audit', { checked: [], notes: '' });
if (!audit || !Array.isArray(audit.checked) || typeof audit.notes !== 'string') audit = { checked: [], notes: '' };
audit.checked = audit.checked.filter(id => checks.some(check => check[0] === id));
$('#audit-list').innerHTML = checks.map(([id, title, desc]) => `<label class="audit-item"><input type="checkbox" value="${id}" ${audit.checked.includes(id) ? 'checked' : ''}><span><strong>${title}</strong><small>${desc}</small></span></label>`).join('');
$('#audit-notes').value = audit.notes;
function auditProgress() { const count = audit.checked.length; $('#audit-progress').textContent = `${count} of 5 recorded`; $('#audit-score').innerHTML = `${count} / 5<small>checks recorded</small>`; }
$('#audit-list').addEventListener('change', () => { audit.checked = [...document.querySelectorAll('#audit-list input:checked')].map(input => input.value); const saved = storage.set('access-audit', audit); auditProgress(); announce(saved ? `${audit.checked.length} of 5 checks recorded locally.` : 'Progress updated for this session. Browser storage is unavailable; export to save.'); });
$('#audit-notes').addEventListener('input', () => { audit.notes = $('#audit-notes').value; if (!storage.set('access-audit', audit)) announce('Browser storage unavailable. Export your checklist to save your notes.'); });
$('#export-audit').addEventListener('click', () => download('access-audit-checklist.json', { title: 'Access v0 manual verification', exportedAt: new Date().toISOString(), status: 'Self-reported checklist; not a conformance report', checks: checks.map(([id, title, steps]) => ({ id, title, steps, recorded: audit.checked.includes(id) })), notes: audit.notes }));
auditProgress();
window.addEventListener('hashchange', () => navigate());
navigate(false);
