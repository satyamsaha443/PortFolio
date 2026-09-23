#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import type { Course } from "../src/types/course.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONTENT_DIR = join(ROOT, "content");
const INDEX_FILE = join(ROOT, "src", "course-index.json");

const FREE_MODE = process.argv.includes("--free");
const FREE_MODULES = new Set([0, 1]); // modules included in the free build
const GUMROAD_URL = "https://gumroad.com/l/YOUR_PRODUCT_ID"; // ← replace after Gumroad setup

const DIST_DIR = join(ROOT, FREE_MODE ? "dist-free" : "dist");

const LESSONS_DIR = join(DIST_DIR, "lessons");
if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });
if (!existsSync(LESSONS_DIR)) mkdirSync(LESSONS_DIR, { recursive: true });

const course: Course = JSON.parse(readFileSync(INDEX_FILE, "utf-8"));

// courseData: metadata only — no lesson HTML embedded in the shell
const courseData = {
  title: course.title,
  modules: course.modules.map((mod) => ({
    id: mod.id,
    number: mod.number,
    title: mod.title,
    description: mod.description,
    estimatedHours: mod.estimatedHours,
    audienceLevels: mod.audienceLevels,
    lessons: mod.lessons.map((lesson) => {
      const contentPath = join(CONTENT_DIR, lesson.contentFile);
      let available = false;
      if (existsSync(contentPath)) {
        // Write each lesson as its own file — fetched on demand
        const md = readFileSync(contentPath, "utf-8");
        const html = marked(md) as string;
        writeFileSync(join(LESSONS_DIR, `${lesson.id}.html`), html, "utf-8");
        available = true;
      }
      const paywalled = FREE_MODE && !FREE_MODULES.has(mod.number);
      return {
        id: lesson.id,
        title: lesson.title,
        estimatedMinutes: lesson.estimatedMinutes,
        audienceLevels: lesson.audienceLevels,
        tags: lesson.tags,
        available: available && !paywalled,
        paywalled,
        contentFile: lesson.contentFile,
        // html intentionally omitted — fetched per-lesson from /lessons/{id}.html
      };
    }),
  })),
};

const totalLessons = courseData.modules.reduce((s, m) => s + m.lessons.length, 0);
const availableLessons = courseData.modules.reduce(
  (s, m) => s + m.lessons.filter((l) => l.available).length,
  0
);

const safeJson = JSON.stringify(courseData)
  .replace(/<\/script/gi, "<\\/script");

// CSS must be defined before buildHTML is called (const is not hoisted)
const CSS = buildCSS();

const outDir = FREE_MODE ? "dist-free" : "dist";
writeFileSync(join(DIST_DIR, "index.html"), buildHTML(safeJson, availableLessons, FREE_MODE, GUMROAD_URL), "utf-8");
console.log(`✓  Built ${outDir}/index.html  (${availableLessons}/${totalLessons} lessons available${FREE_MODE ? " — FREE build" : ""})`);

// ─────────────────────────────────────────────────────────────────────────────

function buildHTML(safeJson: string, availableLessons: number, isFree: boolean, gumroadUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Design: Zero to Mastery</title>
  <style>
${CSS}
  </style>
</head>
<body>
<div id="app">
  <aside id="sidebar">
    <div class="sidebar-header">
      <div class="course-title">System Design<br><span>Zero to Mastery</span></div>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <div class="progress-label" id="progress-label">0 / ${availableLessons} lessons</div>
      </div>
    </div>
    <nav id="sidebar-nav"></nav>
  </aside>
  <div id="main">
    <header id="top-bar">
      <div id="breadcrumb">Select a lesson to begin</div>
      <button class="btn-done" id="btn-done" style="display:none">Mark Complete</button>
    </header>
    <div id="content-scroll">
      <div id="content-area">
        <div class="welcome-screen">
          <div class="ws-hero">
            <div class="ws-icon">&#128218;</div>
            <h1>System Design: Zero to Mastery</h1>
            <p class="ws-sub">121 lessons &nbsp;·&nbsp; 11 modules &nbsp;·&nbsp; ~101 hours of content</p>
          </div>

          <div class="ws-cards">
            <div class="ws-card">
              <div class="ws-card-icon">&#9654;&#65039;</div>
              <h3>How to start</h3>
              <p>Pick your level in the sidebar and click any lesson. Your progress is saved automatically in this browser — pick up where you left off any time.</p>
            </div>
            <div class="ws-card">
              <div class="ws-card-icon">&#127775;</div>
              <h3>New to system design?</h3>
              <p>Start with <strong>M10 Primer</strong> for a fast overview, then <strong>M1 → M2 → M9 Patterns → M3</strong> for the full depth. M10 gives you the map; M1–M3 fills it in.</p>
            </div>
            <div class="ws-card">
              <div class="ws-card-icon">&#128187;</div>
              <h3>Interview in &lt; 1 week?</h3>
              <p>Go to <strong>M5 Lesson 1</strong> (45-min framework), then <strong>M9 Patterns</strong>, then <strong>M8</strong> for the 34 real problems sorted by difficulty.</p>
            </div>
            <div class="ws-card">
              <div class="ws-card-icon">&#128640;</div>
              <h3>Targeting L6 / Staff?</h3>
              <p>Focus on <strong>M4 deep dives</strong>, <strong>M8 Hard problems</strong>, <strong>M5.8</strong> (decomposition framework), and <strong>M0.5</strong> (level expectations).</p>
            </div>
          </div>

          <div class="ws-modules">
            <h3>Course Map</h3>
            <div class="ws-mod-grid">
              <div class="ws-mod-item"><span class="ws-m-num">M0</span><span>Overview &amp; Roadmap</span></div>
              <div class="ws-mod-item"><span class="ws-m-num">M1</span><span>Foundations</span></div>
              <div class="ws-mod-item"><span class="ws-m-num">M2</span><span>Building Blocks</span></div>
              <div class="ws-mod-item ws-m-highlight"><span class="ws-m-num">M9</span><span>Patterns ← study before M3</span></div>
              <div class="ws-mod-item"><span class="ws-m-num">M3</span><span>15 Full Designs</span></div>
              <div class="ws-mod-item"><span class="ws-m-num">M4</span><span>Deep Dives</span></div>
              <div class="ws-mod-item"><span class="ws-m-num">M5</span><span>Interview Mastery</span></div>
              <div class="ws-mod-item"><span class="ws-m-num">M6</span><span>Globalisation</span></div>
              <div class="ws-mod-item"><span class="ws-m-num">M7</span><span>Creator Bonus</span></div>
              <div class="ws-mod-item ws-m-highlight"><span class="ws-m-num">M8</span><span>34 Design Solutions</span></div>
              <div class="ws-mod-item ws-m-highlight"><span class="ws-m-num">M10</span><span>Primer (12 lessons)</span></div>
            </div>
          </div>

          <p class="ws-hint">&#8592; Click any module in the sidebar to expand it and pick a lesson</p>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
var COURSE = ${safeJson};
var IS_FREE = ${isFree};
var GUMROAD_URL = ${JSON.stringify(gumroadUrl)};

var STORAGE_PROGRESS = 'sdc_progress_v1';
var STORAGE_LAST = 'sdc_last_v1';

function loadProgress() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || '[]')); }
  catch(e) { return new Set(); }
}
function saveProgress(s) {
  localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(Array.from(s)));
}

var progress = loadProgress();
var currentId = null;
var lessonCache = {};  // id → html string, populated on first fetch

var flatLessons = [];
for (var mi = 0; mi < COURSE.modules.length; mi++) {
  var mod = COURSE.modules[mi];
  for (var li = 0; li < mod.lessons.length; li++) {
    var l = mod.lessons[li];
    flatLessons.push({
      id: l.id, title: l.title,
      estimatedMinutes: l.estimatedMinutes,
      audienceLevels: l.audienceLevels,
      tags: l.tags, available: l.available, paywalled: l.paywalled,
      contentFile: l.contentFile,
      moduleId: mod.id, moduleNumber: mod.number, moduleTitle: mod.title
    });
  }
}

var contentFileToId = {};
for (var cfi = 0; cfi < flatLessons.length; cfi++) {
  if (flatLessons[cfi].contentFile) contentFileToId[flatLessons[cfi].contentFile] = flatLessons[cfi].id;
}

function resolveContentPath(base, href) {
  var parts = base.split('/');
  parts.pop();
  var rel = href.split('/');
  for (var i = 0; i < rel.length; i++) {
    if (rel[i] === '..') parts.pop();
    else if (rel[i] !== '.') parts.push(rel[i]);
  }
  return parts.join('/');
}

document.getElementById('content-area').addEventListener('click', function(e) {
  var a = e.target.closest('a');
  if (!a) return;
  var href = a.getAttribute('href');
  if (!href || !href.endsWith('.md')) return;
  e.preventDefault();
  var cur = null;
  for (var i = 0; i < flatLessons.length; i++) {
    if (flatLessons[i].id === currentId) { cur = flatLessons[i]; break; }
  }
  if (!cur || !cur.contentFile) return;
  var resolved = resolveContentPath(cur.contentFile, href);
  var targetId = contentFileToId[resolved];
  if (targetId) navigate(targetId);
});

function fetchLesson(id, cb) {
  if (lessonCache[id]) { cb(lessonCache[id]); return; }
  fetch('lessons/' + id + '.html')
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function(html) { lessonCache[id] = html; cb(html); })
    .catch(function() { cb(null); });
}

function levelBadge(level) {
  var t = level[0].toUpperCase();
  return '<span class="badge badge-' + t + '">' + t + '</span>';
}

function renderSidebar() {
  var nav = document.getElementById('sidebar-nav');
  var available = flatLessons.filter(function(x) { return x.available; }).length;
  var done = flatLessons.filter(function(x) { return progress.has(x.id); }).length;
  document.getElementById('progress-fill').style.width = available ? (done / available * 100) + '%' : '0%';
  document.getElementById('progress-label').textContent = done + ' / ' + available + ' lessons';

  nav.innerHTML = '';
  for (var mi = 0; mi < COURSE.modules.length; mi++) {
    var mod = COURSE.modules[mi];
    var isOpen = mod.lessons.some(function(x) { return x.id === currentId; });

    var sec = document.createElement('div');
    sec.className = 'mod-section' + (isOpen ? ' open' : '');
    sec.dataset.mid = mod.id;

    var hdr = document.createElement('div');
    hdr.className = 'mod-hdr';
    hdr.innerHTML =
      '<span class="mod-num">M' + mod.number + '</span>' +
      '<span class="mod-title">' + mod.title + '</span>' +
      '<span class="mod-hrs">' + mod.estimatedHours + 'h</span>' +
      '<span class="mod-chevron"></span>';
    (function(s) { hdr.onclick = function() { s.classList.toggle('open'); }; })(sec);

    var list = document.createElement('div');
    list.className = 'lesson-list';

    for (var li = 0; li < mod.lessons.length; li++) {
      var lesson = mod.lessons[li];
      var cls = ['lesson-item'];
      if (lesson.id === currentId) cls.push('active');
      if (progress.has(lesson.id)) cls.push('done');
      if (!lesson.available) cls.push('locked');

      var item = document.createElement('div');
      item.className = cls.join(' ');
      item.innerHTML =
        '<span class="l-check"></span>' +
        '<span class="l-title">' + lesson.title + '</span>' +
        '<span class="l-meta">' +
          lesson.audienceLevels.map(levelBadge).join('') +
          '<span class="l-mins">' + lesson.estimatedMinutes + 'm</span>' +
        '</span>';

      if (lesson.available) {
        (function(id) { item.onclick = function() { navigate(id); }; })(lesson.id);
      }
      list.appendChild(item);
    }

    sec.appendChild(hdr);
    sec.appendChild(list);
    nav.appendChild(sec);
  }
}

function navigate(id) {
  var lesson = null;
  for (var i = 0; i < flatLessons.length; i++) {
    if (flatLessons[i].id === id) { lesson = flatLessons[i]; break; }
  }
  if (!lesson) return;
  currentId = id;
  localStorage.setItem(STORAGE_LAST, id);
  renderSidebar();

  if (lesson.paywalled) {
    renderPaywall();
    document.getElementById('btn-done').style.display = 'none';
    document.getElementById('breadcrumb').textContent = 'Full course — locked';
    renderSidebar();
    return;
  }
  if (!lesson.available) {
    renderLessonFrame(lesson, null);
    return;
  }

  // Show skeleton while fetching
  var area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading"><div class="spin"></div>Loading…</div>';

  fetchLesson(id, function(html) {
    if (currentId !== id) return; // navigated away while loading
    if (html === null) {
      area.innerHTML =
        '<div class="placeholder"><div class="ph-icon">&#9888;</div>' +
        '<h3>Cannot load lesson</h3>' +
        '<p>This app must be served from a web server, not opened as a local file.<br><br>' +
        'Run: <code>npx serve dist</code> then open the URL it prints.</p></div>';
      return;
    }
    renderLessonFrame(lesson, html);
    document.getElementById('content-scroll').scrollTop = 0;
  });
}

function renderLessonFrame(lesson, html) {
  var mod = null;
  for (var i = 0; i < COURSE.modules.length; i++) {
    if (COURSE.modules[i].id === lesson.moduleId) { mod = COURSE.modules[i]; break; }
  }

  var idx = -1;
  for (var i = 0; i < flatLessons.length; i++) {
    if (flatLessons[i].id === lesson.id) { idx = i; break; }
  }
  var prev = null, next = null;
  for (var i = idx - 1; i >= 0; i--) {
    if (flatLessons[i].available) { prev = flatLessons[i]; break; }
  }
  for (var i = idx + 1; i < flatLessons.length; i++) {
    if (flatLessons[i].available) { next = flatLessons[i]; break; }
  }

  document.getElementById('breadcrumb').innerHTML =
    'M' + mod.number + ' <span>' + escHtml(mod.title) + '</span> &rsaquo; ' + escHtml(lesson.title);

  var btn = document.getElementById('btn-done');
  btn.style.display = '';
  syncDoneBtn(btn, lesson.id);

  var area = document.getElementById('content-area');

  if (html === null) {
    area.innerHTML =
      '<div class="placeholder"><div class="ph-icon">&#9998;</div>' +
      '<h3>Coming Soon</h3><p>This lesson is not yet written.</p></div>';
    return;
  }

  var levelLabels = { beginner: 'Beginner', pro: 'Pro', senior: 'Senior' };
  var metaBadges = lesson.audienceLevels.map(function(lv) {
    var t = lv[0].toUpperCase();
    return '<span class="badge badge-' + t + '" style="font-size:11px;padding:2px 8px">' + (levelLabels[lv] || lv) + '</span>';
  }).join('');

  var tagPills = (lesson.tags || []).map(function(t) {
    return '<span class="tag-pill">' + escHtml(t) + '</span>';
  }).join('');

  var prevBtn = prev
    ? '<button class="nav-btn" data-nav="' + prev.id + '">' +
      '<span class="nav-arrow">&#8592;</span>' +
      '<div><span class="nav-lbl">Previous</span>' +
      '<span class="nav-ttl">' + escHtml(prev.title) + '</span></div></button>'
    : '<div></div>';

  var nextBtn = next
    ? '<button class="nav-btn nav-btn-r" data-nav="' + next.id + '">' +
      '<div><span class="nav-lbl">Next</span>' +
      '<span class="nav-ttl">' + escHtml(next.title) + '</span></div>' +
      '<span class="nav-arrow">&#8594;</span></button>'
    : '<div></div>';

  area.innerHTML =
    '<div class="lesson-meta-row">' + metaBadges +
    '<span class="est-time">~' + lesson.estimatedMinutes + ' min</span>' +
    (tagPills ? '<span class="tag-row">' + tagPills + '</span>' : '') +
    '</div>' +
    '<div class="prose">' + html + '</div>' +
    '<div class="lesson-nav">' + prevBtn + nextBtn + '</div>';

  area.querySelectorAll('[data-nav]').forEach(function(el) {
    el.addEventListener('click', function() { navigate(el.dataset.nav); });
  });
}

function syncDoneBtn(btn, id) {
  var isDone = progress.has(id);
  btn.textContent = isDone ? '✓ Completed' : 'Mark Complete';
  btn.className = 'btn-done' + (isDone ? ' is-done' : '');
  btn.onclick = function() {
    if (progress.has(id)) progress.delete(id); else progress.add(id);
    saveProgress(progress);
    syncDoneBtn(btn, id);
    renderSidebar();
  };
}

function renderPaywall() {
  var area = document.getElementById('content-area');
  area.innerHTML =
    '<div class="paywall">' +
    '<div class="pw-icon">&#128274;</div>' +
    '<h2>This module is in the full course</h2>' +
    '<p>You have free access to <strong>Module 0</strong> (Orientation) and <strong>Module 1</strong> (Foundations) — ' +
    '15 lessons covering everything you need to start.</p>' +
    '<p class="pw-includes">The full course includes:</p>' +
    '<ul class="pw-list">' +
    '<li>&#10003; Module 2 — Core Building Blocks (10 lessons)</li>' +
    '<li>&#10003; Module 3 — 15 Complete End-to-End System Designs</li>' +
    '<li>&#10003; Module 4 — Deep Dives for Senior Engineers</li>' +
    '<li>&#10003; Module 5 — Interview Mastery Playbook</li>' +
    '<li>&#10003; Module 6 — Globalisation & Real-World Deployment</li>' +
    '<li>&#10003; Module 8 — 34 Design Problems (Easy → Hard)</li>' +
    '<li>&#10003; Module 9 — System Design Patterns</li>' +
    '<li>&#10003; Module 10 — Full Primer (12 lessons)</li>' +
    '</ul>' +
    '<a href="' + GUMROAD_URL + '" class="pw-btn" target="_blank" rel="noopener">Get the Full Course &rarr;</a>' +
    '<p class="pw-note">One-time purchase &nbsp;·&nbsp; Instant download &nbsp;·&nbsp; No subscription</p>' +
    '</div>';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

(function init() {
  var lastId = localStorage.getItem(STORAGE_LAST);
  var firstAvail = null;
  for (var i = 0; i < flatLessons.length; i++) {
    if (flatLessons[i].available) { firstAvail = flatLessons[i]; break; }
  }
  var hasLast = lastId && flatLessons.some(function(x) { return x.id === lastId && x.available; });
  if (hasLast) {
    navigate(lastId);
  } else if (firstAvail) {
    navigate(firstAvail.id);
  } else {
    renderSidebar();
  }
})();
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────

function buildCSS(): string { return `
:root {
  --bg: #0f172a;
  --sidebar-bg: #111827;
  --surface: #1e293b;
  --surface-2: #263045;
  --border: #2d3748;
  --text: #f1f5f9;
  --muted: #94a3b8;
  --dim: #64748b;
  --accent: #818cf8;
  --accent-light: #a5b4fc;
  --green: #4ade80;
  --amber: #fbbf24;
  --red: #f87171;
  --sidebar-w: 300px;
  --header-h: 52px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg); color: var(--text); height: 100vh; overflow: hidden;
}
#app { display: flex; height: 100vh; }

/* ── Sidebar ─────────────────────────────────────────── */
#sidebar {
  width: var(--sidebar-w); min-width: var(--sidebar-w);
  background: var(--sidebar-bg); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
}
.sidebar-header {
  padding: 20px 16px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.course-title { font-size: 14px; font-weight: 700; line-height: 1.5; }
.course-title span { color: var(--accent); font-weight: 400; font-size: 12px; }
.progress-wrap { margin-top: 10px; }
.progress-bar { background: var(--border); border-radius: 4px; height: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width .3s ease; width: 0%; }
.progress-label { margin-top: 5px; font-size: 11px; color: var(--dim); }

#sidebar-nav { flex: 1; overflow-y: auto; padding: 4px 0 16px; }
#sidebar-nav::-webkit-scrollbar { width: 4px; }
#sidebar-nav::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* Module sections */
.mod-section { border-bottom: 1px solid var(--border); }
.mod-hdr {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; cursor: pointer; user-select: none;
  transition: background .12s;
}
.mod-hdr:hover { background: var(--surface); }
.mod-num { font-size: 10px; font-weight: 800; color: var(--accent); letter-spacing: .06em; min-width: 22px; }
.mod-title { font-size: 12.5px; font-weight: 600; flex: 1; line-height: 1.3; }
.mod-hrs { font-size: 10px; color: var(--dim); flex-shrink: 0; }
.mod-chevron {
  width: 7px; height: 7px; flex-shrink: 0;
  border-right: 1.5px solid var(--dim); border-bottom: 1.5px solid var(--dim);
  transform: rotate(-45deg); transition: transform .18s;
}
.mod-section.open .mod-chevron { transform: rotate(45deg); }
.lesson-list { display: none; }
.mod-section.open .lesson-list { display: block; }

/* Lesson items */
.lesson-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 7px 14px 7px 34px; cursor: pointer;
  border-left: 2px solid transparent; transition: background .12s;
}
.lesson-item:hover:not(.locked) { background: var(--surface); }
.lesson-item.active { background: var(--surface); border-left-color: var(--accent); }
.lesson-item.locked { opacity: .35; cursor: default; }
.l-check {
  width: 13px; height: 13px; min-width: 13px; margin-top: 2px;
  border: 1.5px solid var(--border); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 7px; color: #000;
}
.lesson-item.done .l-check { background: var(--green); border-color: var(--green); }
.lesson-item.done .l-check::after { content: '✓'; }
.l-title { font-size: 12px; color: var(--muted); flex: 1; line-height: 1.35; }
.lesson-item.active .l-title { color: var(--text); }
.l-meta { display: flex; align-items: center; gap: 3px; flex-shrink: 0; margin-top: 2px; }
.l-mins { font-size: 9px; color: var(--dim); }

/* Badges */
.badge { font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; letter-spacing: .04em; }
.badge-B { background: rgba(74,222,128,.14); color: var(--green); }
.badge-P { background: rgba(251,191,36,.14); color: var(--amber); }
.badge-S { background: rgba(248,113,113,.14); color: var(--red); }

/* ── Main area ───────────────────────────────────────── */
#main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
#top-bar {
  height: var(--header-h); min-height: var(--header-h);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 28px; border-bottom: 1px solid var(--border);
  background: var(--sidebar-bg); gap: 16px;
}
#breadcrumb { font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#breadcrumb span { color: var(--muted); }

.btn-done {
  flex-shrink: 0; font-size: 12px; padding: 5px 12px;
  border-radius: 6px; border: 1px solid var(--border);
  background: transparent; color: var(--muted); cursor: pointer;
  transition: all .15s; font-family: inherit;
}
.btn-done:hover { background: var(--surface); color: var(--text); }
.btn-done.is-done { background: rgba(74,222,128,.1); border-color: var(--green); color: var(--green); }

#content-scroll { flex: 1; overflow-y: auto; }
#content-scroll::-webkit-scrollbar { width: 6px; }
#content-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
#content-area { max-width: 780px; margin: 0 auto; padding: 36px 40px 80px; }

/* Lesson meta row */
.lesson-meta-row { display: flex; align-items: center; gap: 6px; margin-bottom: 20px; flex-wrap: wrap; }
.est-time { font-size: 11px; color: var(--dim); margin-left: 4px; }
.tag-row { display: flex; gap: 4px; flex-wrap: wrap; }
.tag-pill { font-size: 10px; padding: 2px 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; color: var(--dim); }

/* Prose (rendered markdown) */
.prose { line-height: 1.78; font-size: 15px; color: var(--text); }
.prose h1 { font-size: 26px; font-weight: 700; margin-bottom: 16px; line-height: 1.25; }
.prose h2 { font-size: 19px; font-weight: 600; margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.prose h3 { font-size: 15px; font-weight: 600; margin: 24px 0 8px; color: var(--accent-light); }
.prose h4 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; }
.prose p { margin-bottom: 16px; }
.prose ul, .prose ol { margin: 0 0 16px 22px; }
.prose li { margin-bottom: 5px; }
.prose li > p { margin-bottom: 4px; }
.prose blockquote {
  border-left: 3px solid var(--accent); margin: 20px 0; padding: 10px 18px;
  background: var(--surface); border-radius: 0 6px 6px 0;
  color: var(--muted); font-style: italic;
}
.prose blockquote > p { margin-bottom: 0; }
.prose code {
  font-family: 'Cascadia Code','Fira Code','Consolas',monospace;
  font-size: 13px; background: var(--surface); color: #a5b4fc;
  padding: 2px 6px; border-radius: 4px;
}
.prose pre {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 18px; overflow-x: auto; margin: 16px 0;
}
.prose pre code { background: none; padding: 0; color: #e2e8f0; font-size: 13px; }
.prose table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
.prose th {
  background: var(--surface); padding: 9px 12px; text-align: left;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); border-bottom: 2px solid var(--border);
}
.prose td { padding: 9px 12px; border-bottom: 1px solid var(--border); }
.prose tr:hover td { background: rgba(30,41,59,.5); }
.prose a { color: var(--accent-light); text-decoration: none; }
.prose a:hover { text-decoration: underline; }
.prose hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
.prose strong { font-weight: 600; }
.prose em { color: var(--muted); }

/* Prev / Next navigation */
.lesson-nav {
  display: flex; justify-content: space-between;
  margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); gap: 12px;
}
.nav-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; color: var(--muted); cursor: pointer;
  transition: all .15s; max-width: 48%; min-width: 0;
  text-align: left; font-family: inherit; font-size: 13px;
}
.nav-btn:hover { background: var(--surface-2); border-color: var(--accent); color: var(--text); }
.nav-btn-r { text-align: right; margin-left: auto; }
.nav-arrow { font-size: 16px; color: var(--accent); flex-shrink: 0; }
.nav-lbl { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); }
.nav-ttl {
  display: block; font-size: 13px; font-weight: 500; color: var(--text);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 240px;
}

/* Placeholder / coming soon */
.placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 280px; gap: 12px; text-align: center; color: var(--dim);
}
.ph-icon { font-size: 40px; }
.placeholder h1 { font-size: 22px; font-weight: 700; color: var(--text); }
.placeholder h3 { font-size: 16px; color: var(--muted); }
.placeholder p { font-size: 14px; max-width: 320px; line-height: 1.6; }

/* Loading state */
.loading {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; min-height: 200px; color: var(--dim); font-size: 14px;
}
.spin {
  width: 18px; height: 18px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin .7s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Welcome screen */
.welcome-screen { padding: 12px 0 60px; }
.ws-hero { text-align: center; margin-bottom: 36px; }
.ws-icon { font-size: 44px; margin-bottom: 12px; }
.ws-hero h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.ws-sub { font-size: 13px; color: var(--dim); }
.ws-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 36px; }
.ws-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 18px 20px;
}
.ws-card-icon { font-size: 22px; margin-bottom: 8px; }
.ws-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--accent-light); }
.ws-card p { font-size: 12.5px; color: var(--muted); line-height: 1.6; margin: 0; }
.ws-card strong { color: var(--text); font-weight: 600; }
.ws-modules { margin-bottom: 28px; }
.ws-modules h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); margin-bottom: 12px; }
.ws-mod-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ws-mod-item {
  display: flex; align-items: center; gap: 8px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 9px 12px; font-size: 12px; color: var(--muted);
}
.ws-mod-item.ws-m-highlight { border-color: var(--accent); background: rgba(129,140,248,.08); color: var(--text); }
.ws-m-num { font-size: 10px; font-weight: 800; color: var(--accent); min-width: 22px; }
.ws-hint { text-align: center; font-size: 12px; color: var(--dim); margin-top: 8px; }

/* Paywall screen */
.paywall {
  max-width: 520px; margin: 60px auto; text-align: center;
  background: var(--surface); border: 1px solid var(--accent);
  border-radius: 14px; padding: 44px 40px;
}
.pw-icon { font-size: 40px; margin-bottom: 16px; }
.paywall h2 { font-size: 22px; font-weight: 700; margin-bottom: 14px; }
.paywall p { font-size: 14px; color: var(--muted); line-height: 1.7; margin-bottom: 14px; }
.paywall strong { color: var(--text); }
.pw-includes { font-weight: 600; color: var(--text) !important; margin-bottom: 8px !important; }
.pw-list { list-style: none; text-align: left; margin: 0 0 24px; padding: 0; }
.pw-list li { font-size: 13px; color: var(--muted); padding: 5px 0; border-bottom: 1px solid var(--border); }
.pw-list li:last-child { border-bottom: none; }
.pw-btn {
  display: inline-block; background: var(--accent); color: #fff;
  font-size: 15px; font-weight: 600; padding: 13px 32px;
  border-radius: 8px; text-decoration: none; transition: opacity .15s;
  margin-bottom: 14px;
}
.pw-btn:hover { opacity: .88; text-decoration: none; }
.pw-note { font-size: 12px !important; color: var(--dim) !important; margin-bottom: 0 !important; }
`; }
