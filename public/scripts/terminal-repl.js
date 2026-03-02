/**
 * Terminal REPL Engine
 * Handles: command parsing, fetch-and-inject navigation, pushState,
 * sessionStorage history, Tab autocomplete, event delegation.
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────
  let currentPath = '~';
  let fsMap = null;       // filesystem JSON cache
  let historyIndex = -1;  // for up/down arrow
  let cmdHistory = [];    // loaded from sessionStorage

  // ── DOM refs ──────────────────────────────────────────────────
  const win       = document.getElementById('terminal-window');
  const historyEl = document.getElementById('terminal-history');
  const contentEl = document.getElementById('terminal-content');
  const inputEl   = document.getElementById('terminal-input');
  const pathEl    = document.getElementById('current-path');

  if (!win || !historyEl || !contentEl || !inputEl || !pathEl) return;

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    // Restore path from data attribute
    currentPath = contentEl.dataset.path || '~';

    // Load command history from sessionStorage
    try {
      cmdHistory = JSON.parse(sessionStorage.getItem('terminal-cmd-history') || '[]');
    } catch { cmdHistory = []; }

    // Prefetch filesystem map
    fetch('/api/filesystem.json')
      .then(r => r.json())
      .then(data => { fsMap = data; })
      .catch(() => {});

    // Wire up input
    inputEl.addEventListener('keydown', onKeyDown);

    // Event delegation for terminal links
    win.addEventListener('click', onLinkClick);

    // Popstate (browser back/forward)
    window.addEventListener('popstate', onPopState);

    // Auto-focus input on click anywhere in terminal window
    win.addEventListener('click', e => {
      if (!e.target.closest('a')) inputEl.focus();
    });

    inputEl.focus();
  }

  // ── Key handling ──────────────────────────────────────────────
  function onKeyDown(e) {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        handleCommand(inputEl.value.trim());
        break;
      case 'Tab':
        e.preventDefault();
        tabComplete();
        break;
      case 'ArrowUp':
        e.preventDefault();
        navigateHistory(1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigateHistory(-1);
        break;
    }
  }

  // ── Command parsing ───────────────────────────────────────────
  function handleCommand(raw) {
    if (!raw) return;

    pushToHistory(raw);
    inputEl.value = '';
    historyIndex = -1;

    const parts = raw.trim().split(/\s+/);
    const cmd   = parts[0];
    const arg   = parts.slice(1).join(' ');

    switch (cmd) {
      case 'pwd':
        appendOutput(raw, `<div class="prompt__path" style="padding: 0.25rem 1.5rem">${currentPath}</div>`);
        break;
      case 'clear':
        historyEl.innerHTML = '';
        break;
      case 'help':
        appendOutput(raw, buildHelpOutput());
        break;
      case 'ls':
        navigateTo(raw, resolveUrl('ls', arg || ''));
        break;
      case 'cat':
        if (!arg) {
          appendOutput(raw, errMsg('cat: missing filename'));
        } else {
          navigateTo(raw, resolveUrl('cat', arg), false);
        }
        break;
      case 'cd':
        if (!arg || arg === '~') {
          navigateTo(raw, '/');
        } else {
          navigateTo(raw, resolveUrl('cd', arg));
        }
        break;
      default:
        appendOutput(raw, errMsg(`${cmd}: command not found. Type 'help' for available commands.`));
    }
  }

  // ── URL resolution ────────────────────────────────────────────
  function resolveUrl(cmd, arg) {
    // Normalize arg: strip trailing slash for lookup, add for dirs
    const clean = arg.replace(/\/$/, '').replace(/^~\//, '');

    // Direct path mappings
    const fileMap = {
      'cv.md':         '/cv/',
      'bio.md':        '/bio/',
      'tech_stack.md': '/tech-stack/',
      'contact.md':    '/contact/',
    };

    if (cmd === 'cat') {
      // cat bio.md → /bio/
      if (fileMap[clean]) return fileMap[clean];

      const parts = clean.split('/');
      if (parts.length === 2) {
        // cat projects/my-app.mdx → /projects/my-app/
        const dir  = parts[0];
        const file = parts[1].replace(/\.mdx?$/, '');
        return `/${dir}/${file}/`;
      }

      // Single filename — resolve relative to current directory
      // e.g. inside ~/experience: cat wfr.mdx → /experience/wfr/
      if (parts.length === 1 && currentPath !== '~') {
        const dir  = currentPath.replace(/^~\/?/, '');
        const file = clean.replace(/\.mdx?$/, '');
        return `/${dir}/${file}/`;
      }

      return `/${clean.replace(/\.mdx?$/, '')}/`;
    }

    if (cmd === 'ls' || cmd === 'cd') {
      if (!clean || clean === '~') return '/';
      if (clean === '..') return resolveParent();

      // Relative dir: projects → /projects/
      const dir = clean.replace(/^\//, '').replace(/\/$/, '');

      // From current path context
      if (currentPath !== '~' && !dir.includes('/')) {
        const base = currentPath.replace(/^~\//, '');
        // If we're already in /projects/ and type "cd .." it's handled above
        // If we're at root and type "cd projects" → /projects/
        return `/${dir}/`;
      }
      return `/${dir}/`;
    }

    return '/';
  }

  function resolveParent() {
    // ~ → stays at ~
    if (currentPath === '~') return '/';
    // ~/projects → ~
    const parts = currentPath.replace(/^~\/?/, '').split('/').filter(Boolean);
    if (parts.length <= 1) return '/';
    parts.pop();
    return `/${parts.join('/')}/`;
  }

  // ── Fetch-and-inject navigation ───────────────────────────────
  async function navigateTo(cmd, url, updatePath = true) {
    if (!url) {
      appendOutput(cmd, errMsg('Cannot resolve path'));
      return;
    }

    // Move current content to history
    const snapshot = contentEl.innerHTML;
    const histEntry = document.createElement('div');
    histEntry.className = 'history-entry';
    histEntry.innerHTML = promptHtml(currentPath, cmd) + snapshot;
    historyEl.appendChild(histEntry);
    contentEl.innerHTML = '<div style="padding:0.5rem 1.5rem;color:var(--muted-light)">Loading…</div>';

    try {
      const res = await fetch(url, { headers: { 'Accept': 'text/html' } });
      if (!res.ok) throw new Error(`${res.status}`);

      const html  = await res.text();
      const doc   = new DOMParser().parseFromString(html, 'text/html');
      const fresh = doc.getElementById('terminal-content');

      if (fresh) {
        injectPageStyles(doc);
        contentEl.innerHTML = fresh.innerHTML;
        if (updatePath) {
          const newPath = fresh.dataset.path || pathFromUrl(url);
          currentPath = newPath;
          pathEl.textContent = newPath;
          updateStatusPath(newPath);
        }
        history.pushState({ path: currentPath, url }, '', url);
        scrollToBottom();
      } else {
        // Fallback: navigate normally
        window.location.href = url;
      }
    } catch (err) {
      contentEl.innerHTML = snapshot; // restore on error
      appendOutput(cmd, errMsg(`fetch error: ${err.message}`));
    }
  }

  function pathFromUrl(url) {
    const u = url.replace(/\/$/, '');
    if (!u || u === '') return '~';
    return '~' + u;
  }

  // ── Style injection ───────────────────────────────────────────
  // Astro scopes page styles into <style> tags in <head>. When we inject
  // only #terminal-content, those styles are missing. Copy any <style>
  // blocks from the fetched page that aren't already in our <head>.
  function injectPageStyles(doc) {
    const existing = new Set(
      Array.from(document.head.querySelectorAll('style')).map(s => s.textContent)
    );
    doc.head.querySelectorAll('style').forEach(style => {
      if (!existing.has(style.textContent)) {
        document.head.appendChild(style.cloneNode(true));
      }
    });
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const element = document.querySelectorAll('#terminal-content > div')
      const last = element[element.length - 1]
      last.scrollIntoView()
    });
  }

  // ── Inline output (no navigation) ────────────────────────────
  function appendOutput(cmd, html) {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.innerHTML = promptHtml(currentPath, cmd) + html;
    historyEl.appendChild(entry);
    scrollToBottom();
  }

  // ── Prompt HTML builder ───────────────────────────────────────
  function promptHtml(path, cmd) {
    return `<div class="prompt">
      <span class="prompt__user">fer</span>
      <span class="prompt__sep">@</span>
      <span class="prompt__host">portfolio</span>
      <span class="prompt__sep">:</span>
      <span class="prompt__path">${escHtml(path)}</span>
      <span class="prompt__dollar">$</span>
      <span class="prompt__cmd">${escHtml(cmd)}</span>
    </div>`;
  }

  function errMsg(msg) {
    return `<div style="padding:0.25rem 1.5rem;color:#ff4c4c;font-size:0.85rem">${escHtml(msg)}</div>`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Help output ───────────────────────────────────────────────
  function buildHelpOutput() {
    const cmds = [
      ['ls [path]',    'list directory contents'],
      ['cat <file>',   'display file contents'],
      ['cd <dir>',     'change directory'],
      ['cd ..',        'go up one level'],
      ['pwd',          'print working directory'],
      ['clear',        'clear terminal history'],
      ['help',         'show this message'],
    ];
    const rows = cmds.map(([c, d]) =>
      `<div class="ls-entry" style="grid-template-columns: 14rem 1fr">
        <span class="ls-entry__name ls-entry__name--file">${escHtml(c)}</span>
        <span class="ls-entry__desc">${escHtml(d)}</span>
      </div>`
    ).join('');
    return `<div class="ls-output"><div class="ls-output__header">Available commands:</div>${rows}</div>`;
  }

  // ── Command history (sessionStorage) ─────────────────────────
  function pushToHistory(cmd) {
    // Avoid consecutive duplicates
    if (cmdHistory[cmdHistory.length - 1] !== cmd) {
      cmdHistory.push(cmd);
      try {
        sessionStorage.setItem('terminal-cmd-history', JSON.stringify(cmdHistory));
      } catch {}
    }
    historyIndex = -1;
  }

  function navigateHistory(direction) {
    if (cmdHistory.length === 0) return;

    if (direction === 1) {
      // Up arrow
      if (historyIndex < cmdHistory.length - 1) historyIndex++;
    } else {
      // Down arrow
      if (historyIndex > -1) historyIndex--;
    }

    inputEl.value = historyIndex === -1
      ? ''
      : cmdHistory[cmdHistory.length - 1 - historyIndex];

    // Move cursor to end
    const len = inputEl.value.length;
    inputEl.setSelectionRange(len, len);
  }

  // ── Tab autocomplete ──────────────────────────────────────────
  function tabComplete() {
    if (!fsMap) return;

    const val   = inputEl.value;
    const parts = val.split(' ');
    if (parts.length < 2) return; // need "cmd partial"

    const cmdPart     = parts[0];
    const partialArg  = parts.slice(1).join(' ');

    // Determine which directory to search
    let dirKey = '/';
    let prefix = '';

    const slashIdx = partialArg.lastIndexOf('/');
    if (slashIdx >= 0) {
      dirKey = '/' + partialArg.slice(0, slashIdx + 1);
      prefix = partialArg.slice(slashIdx + 1);
    } else {
      // No slash — search current directory, fall back to root
      const curDir = currentPath === '~'
        ? '/'
        : '/' + currentPath.replace(/^~\/?/, '') + '/';
      const candidates = fsMap[curDir] || fsMap['/'] || [];
      const matches = candidates.filter(c => c.startsWith(partialArg));
      if (matches.length === 1) {
        inputEl.value = `${cmdPart} ${matches[0]}`;
      } else if (matches.length > 1) {
        appendOutput('', `<div style="padding:0.25rem 1.5rem;font-size:0.8rem;color:var(--muted-light)">${matches.join('  ')}</div>`);
      }
      return;
    }

    const candidates = fsMap[dirKey] || [];
    const matches = candidates.filter(c => c.startsWith(prefix));

    if (matches.length === 1) {
      inputEl.value = `${cmdPart} ${dirKey.slice(1)}${matches[0]}`;
    } else if (matches.length > 1) {
      appendOutput('', `<div style="padding:0.25rem 1.5rem;font-size:0.8rem;color:var(--muted-light)">${matches.join('  ')}</div>`);
    }
  }

  // ── Event delegation for terminal links ───────────────────────
  function onLinkClick(e) {
    const link = e.target.closest('[data-terminal-link]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto')) return;

    e.preventDefault();
    const cmdText = hrefToCmd(href);
    pushToHistory(cmdText);
    navigateTo(cmdText, href);
  }

  function hrefToCmd(href) {
    const clean = href.replace(/\/$/, '').replace(/^\//, '');
    if (!clean) return 'ls';

    const parts = clean.split('/');
    // Single segment → directory
    if (parts.length === 1) return `cd ${clean}`;
    // Two segments → cat
    return `cat ${parts.join('/')}`;
  }

  // ── Popstate (browser back/forward) ──────────────────────────
  async function onPopState(e) {
    const state = e.state;
    const url   = window.location.pathname;

    try {
      const res  = await fetch(url, { headers: { 'Accept': 'text/html' } });
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');
      const fresh = doc.getElementById('terminal-content');

      if (fresh) {
        injectPageStyles(doc);
        contentEl.innerHTML = fresh.innerHTML;
        currentPath = (state && state.path) || fresh.dataset.path || pathFromUrl(url);
        pathEl.textContent = currentPath;
        updateStatusPath(currentPath);
      }
    } catch {}
  }

  // ── Status bar path update ────────────────────────────────────
  function updateStatusPath(path) {
    const statusPath = document.querySelector('.status-bar__path');
    if (statusPath) statusPath.textContent = path;
    // Also update terminal header title
    const headerTitle = document.querySelector('.terminal-header__title');
    if (headerTitle) {
      headerTitle.textContent = `fernando@portfolio:${path}`;
    }
  }

  // ── Boot ──────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
