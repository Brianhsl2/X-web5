/**
 * site-includes.js
 * Injects shared header/footer partials and wires global UI behaviors.
 */

function scriptBaseUrl() {
  // Resolve relative includes based on where this JS file is loaded from.
  const src = document.currentScript && document.currentScript.src;
  const base = src ? new URL('.', src) : new URL('.', location.href);
  return base;
}

async function loadPartial(file) {
  const url = new URL(file, scriptBaseUrl());
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(url.pathname + " HTTP " + response.status);
  return response.text();
}

function parseFirstElement(html) {
  const template = document.createElement("template");
  template.innerHTML = (html || "").trim();
  return template.content.firstElementChild;
}

function replaceOrInject(selector, html) {
  const existing = document.querySelector(selector);
  if (!existing) return;

  const replacement = parseFirstElement(html);
  if (replacement) {
    existing.replaceWith(replacement);
  } else {
    existing.innerHTML = html;
  }
}

function markActiveNav() {
  const currentPath = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const links = document.querySelectorAll('header.site-header nav a[href]');
  links.forEach(a => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href === currentPath) a.setAttribute('aria-current', 'page');
  });
}

function wireThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  const saved = localStorage.getItem("xenablers-theme");
  if (saved === "dark" || saved === "light") {
    document.documentElement.setAttribute("data-theme", saved);
  }

  function effectiveTheme() {
    const explicit = document.documentElement.getAttribute("data-theme");
    if (explicit === "dark" || explicit === "light") return explicit;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateToggleUI() {
    const isDark = effectiveTheme() === "dark";
    btn.setAttribute("aria-pressed", String(isDark));
    btn.textContent = isDark ? "Light" : "Dark";
    btn.setAttribute("aria-label", isDark ? "Toggle light mode" : "Toggle dark mode");
    btn.classList.toggle("btn-dark-active", isDark);
  }

  updateToggleUI();

  btn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("xenablers-theme", next);
    updateToggleUI();
  });

  if (!document.documentElement.getAttribute("data-theme")) {
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq && mq.addEventListener) mq.addEventListener("change", updateToggleUI);
  }
}

function ensureIndustryServicesButton() {
  const nav = document.querySelector('header.site-header nav');
  if (!nav) return;

  const existing = nav.querySelector('a[href="industry-services.html"]');
  if (existing) return;

  const a = document.createElement('a');
  a.href = 'industry-services.html';
  a.className = 'btn btn-outline btn-nav-cta';
  a.textContent = 'Industry Services';

  const primaryCta = nav.querySelector('a.btn.btn-primary.btn-nav-cta');
  if (primaryCta) nav.insertBefore(a, primaryCta);
  else nav.appendChild(a);
}

async function injectIncludes() {
  try {
    const [headerHtml, footerHtml] = await Promise.all([
      loadPartial("header.html"),
      loadPartial("footer.html"),
    ]);

    replaceOrInject('header.site-header', headerHtml);
    replaceOrInject('footer.site-footer', footerHtml);

    ensureIndustryServicesButton();
    wireThemeToggle();
    markActiveNav();
  } catch (error) {
    console.error("site-includes injection failed:", error);
  }
}

document.addEventListener("DOMContentLoaded", injectIncludes);
