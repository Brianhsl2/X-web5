/**
 * site-includes.js
 * Injects shared header/footer partials and wires global UI behaviors.
 */

async function loadPartial(file) {
  const response = await fetch(file, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(file + " HTTP " + response.status);
  }
  return response.text();
}

function parseFirstElement(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function replaceOrInject(selector, targetId, html) {
  const target = document.getElementById(targetId);
  const replacement = parseFirstElement(html);
  if (!replacement) return;

  if (target) {
    target.innerHTML = "";
    target.appendChild(replacement);
    return;
  }

  const existing = document.querySelector(selector);
  if (existing) {
    existing.replaceWith(replacement);
  }
}

function markActiveNav() {
  const currentPath = location.pathname.split("/").pop() || "index.html";
  const navLink = document.querySelector(
    'header.site-header nav a[href="' + currentPath + '"]'
  );
  if (navLink) {
    navLink.setAttribute("aria-current", "page");
  }
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

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function updateToggleUI() {
    const isDark = effectiveTheme() === "dark";
    btn.setAttribute("aria-pressed", String(isDark));
    btn.innerHTML = isDark ? "&#9728; Light" : "&#9790; Dark";
    btn.setAttribute("aria-label", isDark ? "Toggle light mode" : "Toggle dark mode");
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
    if (mq && mq.addEventListener) {
      mq.addEventListener("change", updateToggleUI);
    }
  }
}

async function injectIncludes() {
  try {
    const [headerHtml, footerHtml] = await Promise.all([
      loadPartial("header.html"),
      loadPartial("footer.html"),
    ]);

    replaceOrInject("header.site-header", "siteHeader", headerHtml);
    replaceOrInject("footer.site-footer", "siteFooter", footerHtml);

    markActiveNav();
    wireThemeToggle();
  } catch (error) {
    console.error("site-includes injection failed:", error);
  }
}

document.addEventListener("DOMContentLoaded", injectIncludes);
