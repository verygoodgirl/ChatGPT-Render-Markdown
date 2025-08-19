// ==UserScript==
// @name         ChatGPT — Render Markdown in YOUR messages (+links, headings, lists, Alt+M)
// @namespace    otto.md.user
// @version      0.5.0
// @description  Locally renders *italic*, **bold**, ***bold+italic***, ~~strike~~, [links](), #/##/### headings and lists in YOUR messages on chatgpt.com. Alt+M toggles ON/OFF.
// @match        https://chatgpt.com/*
// @match        https://*.chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // --- state / toggle ---
  const LS_KEY = "ottoMdEnabled";
  let ENABLED = localStorage.getItem(LS_KEY);
  if (ENABLED == null) { ENABLED = "1"; localStorage.setItem(LS_KEY, ENABLED); }
  const isOn = () => ENABLED === "1";
  const setOn = (v) => { ENABLED = v ? "1" : "0"; localStorage.setItem(LS_KEY, ENABLED); badge.textContent = `MD ${isOn() ? "ON" : "OFF"}`; };

  // --- badge ---
  const badge = document.createElement("div");
  badge.textContent = `MD ${isOn() ? "ON" : "OFF"}`;
  Object.assign(badge.style, {
    position: "fixed", left: "10px", bottom: "10px", zIndex: 9999,
    font: "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial",
    padding: "4px 6px", borderRadius: "6px", opacity: "0.6",
    pointerEvents: "none"
  });
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(badge));

  // Toggle Alt+M
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key.toLowerCase() === "m")) {
      setOn(!isOn());
    }
  });

  // --- utils ---
  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function renderMarkdownLite(input) {
    if (!input) return input;

    // opt-out: if "{{{" is present, do not touch the message
    if (input.includes("{{{")) return escapeHtml(input).replace(/\n/g, "<br>");

    // 0) protect escapes \* \_ \~ \` \[ \] \( \)
    const ESC = [];
    input = input.replace(/\\([*_~`[\]()])/g, (_, ch) => {
      const t = `__ESC_${ESC.length}__`;
      ESC.push(ch);
      return t;
    });

    // 1) escape HTML first
    let text = escapeHtml(input);

    // 2) pull out code blocks and inline code (placeholders)
    const BLOCKS = [];
    text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
      const t = `__CODEBLOCK_${BLOCKS.length}__`;
      BLOCKS.push(`<pre><code>${code}</code></pre>`);
      return t;
    });

    const INLINES = [];
    text = text.replace(/`([^`\n]+)`/g, (_, code) => {
      const t = `__CODEINLINE_${INLINES.length}__`;
      INLINES.push(`<code>${code}</code>`);
      return t;
    });

    // 3) block-level: headings + unordered/ordered lists + checkboxes
    // Headings (1..3)
    text = text.replace(/^(#{1,3})\s+(.+)$/gm, (_, hashes, title) => {
      const lvl = hashes.length;
      return `<div class="otto-h${lvl}">${title}</div>`;
    });

    // Unordered lists: lines starting with - or *
    text = text.replace(/(^|\n)((?:[ \t]*[-*]\s+[^\n]+\n?)+)/g, (m, lead, block) => {
      const items = block.trim().split(/\n/).map(l => l.replace(/^[ \t]*[-*]\s+/, "").trim());
      return `${lead}<ul class="otto-ul">` + items.map(i => `<li>${i}</li>`).join("") + `</ul>`;
    });

    // Ordered lists: 1. 2. 3.
    text = text.replace(/(^|\n)((?:[ \t]*\d+\.\s+[^\n]+\n?)+)/g, (m, lead, block) => {
      const items = block.trim().split(/\n/).map(l => l.replace(/^[ \t]*\d+\.\s+/, "").trim());
      return `${lead}<ol class="otto-ol">` + items.map(i => `<li>${i}</li>`).join("") + `</ol>`;
    });

    // Task checkboxes: [ ] / [x]
    text = text.replace(/(^|\n)\[([ xX])\][ \t]+([^\n]+)/g, (m, lead, c, t) => {
      const box = c.trim() ? "☑" : "☐";
      return `${lead}<span class="otto-checkbox">${box}</span> ${t}`;
    });

    // 4) inline markdown (outside code)
    // bold+italic
    text = text.replace(/\*\*\*([^*][\s\S]*?)\*\*\*/g, "<strong><em>$1</em></strong>");
    text = text.replace(/___([^_][\s\S]*?)___/g, "<strong><em>$1</em></strong>");
    // bold
    text = text.replace(/\*\*([^*][\s\S]*?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_][\s\S]*?)__/g, "<strong>$1</strong>");
    // italic
    text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, "$1<em>$2</em>");
    text = text.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?;:]|$)/g, "$1<em>$2</em>");
    // strike
    text = text.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    // links [text](https://...)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`);

    // 5) newlines → <br>
    text = text.replace(/\n/g, "<br>");

    // 6) restore code placeholders
    text = text.replace(/__CODEINLINE_(\d+)__/g, (_, i) => INLINES[+i]);
    text = text.replace(/__CODEBLOCK_(\d+)__/g, (_, i) => BLOCKS[+i]);

    // 7) restore escapes
    text = text.replace(/__ESC_(\d+)__/g, (_, i) => ESC[+i]);

    return text;
  }

  function enhanceMessageRoot(msgRoot) {
    if (!msgRoot || msgRoot.dataset.ottoMdRoot) return;
    if (localStorage.getItem(LS_KEY) !== "1") return;

    const candidates = Array.from(
      msgRoot.querySelectorAll(
        '.whitespace-pre-wrap, .text-base, .break-words, .text-token-text-primary, p, span, div'
      )
    ).filter((el) => {
      if (el.dataset.ottoMd) return false;
      if (el.closest('pre, code, [contenteditable="true"]')) return false;
      if (el.getAttribute("role") === "button") return false;
      return el.childElementCount === 0 && el.textContent && el.textContent.trim().length;
    });

    let touched = false;
    for (const el of candidates) {
      const raw = el.textContent;
      const html = renderMarkdownLite(raw);
      if (html && html !== raw) {
        el.innerHTML = html;
        el.dataset.ottoMd = "1";
        touched = true;
      }
    }
    if (touched) msgRoot.dataset.ottoMdRoot = "1";
  }

  function scan() {
    if (localStorage.getItem(LS_KEY) !== "1") return;
    const nodes = document.querySelectorAll(
      '[data-message-author-role="user"], [data-testid="user-message"], div:has(> div[data-message-author-role="user"])'
    );
    for (const n of nodes) enhanceMessageRoot(n);
  }

  // observe SPA changes
  const mo = new MutationObserver((muts) => {
    if (localStorage.getItem(LS_KEY) !== "1") return;
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (
          node.matches?.('[data-message-author-role="user"], [data-testid="user-message"], div:has(> div[data-message-author-role="user"])')
        ) {
          enhanceMessageRoot(node);
        }
        node
          .querySelectorAll?.('[data-message-author-role="user"], [data-testid="user-message"], div:has(> div[data-message-author-role="user"])')
          .forEach(enhanceMessageRoot);
      }
    }
  });

  // minimal styles for blocks
  const style = document.createElement("style");
  style.textContent = `
    [data-message-author-role="user"] code { padding: 0.1em 0.25em; border-radius: 4px; }
    [data-message-author-role="user"] pre  { padding: .6em .8em; border-radius: 8px; overflow: auto; }
    [data-message-author-role="user"] .otto-h1 { display:block; font-weight:700; font-size:1.05em; margin: .4em 0 .1em; }
    [data-message-author-role="user"] .otto-h2 { display:block; font-weight:700; font-size:1.0em;  margin: .35em 0 .05em; opacity:.9;}
    [data-message-author-role="user"] .otto-h3 { display:block; font-weight:600; font-size:.95em;  margin: .3em 0 0; opacity:.85;}
    [data-message-author-role="user"] ul.otto-ul { margin: .2em 0; padding-left: 1.2em; }
    [data-message-author-role="user"] ul.otto-ul li { list-style: disc; margin: .15em 0; }
    [data-message-author-role="user"] ol.otto-ol { margin: .2em 0; padding-left: 1.2em; }
    [data-message-author-role="user"] ol.otto-ol li { margin: .15em 0; }
  `;
  document.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(style);
  });

  // kick off
  scan();
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, 1000);

  console.info("[Otto MD] userscript loaded");
})();
