/* PRISM - bootstrap. Guards WebGL support and module loading, shows a styled
   fallback if anything fails before React can mount. */

const rootEl = document.getElementById("root");
const loaderEl = document.getElementById("loader");

function hideLoader() {
  if (loaderEl) loaderEl.classList.add("done");
}

function showFallback(message) {
  hideLoader();
  const wrap = document.createElement("div");
  wrap.className = "boot-fallback";
  const card = document.createElement("div");
  card.className = "fallback-card";
  const title = document.createElement("strong");
  title.textContent = "PRISM could not start.";
  const body = document.createElement("p");
  body.textContent =
    "This page needs WebGL and modern JavaScript modules. Turn on hardware acceleration, or open it in the latest Chrome, Edge, Firefox or Safari.";
  const detail = document.createElement("code");
  detail.textContent = message;
  card.append(title, body, detail);
  wrap.append(card);
  (rootEl || document.body).appendChild(wrap);
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch (err) {
    return false;
  }
}

(async () => {
  try {
    if (!webglAvailable()) {
      throw new Error("No WebGL context is available in this browser.");
    }
    const { mountApp } = await import("./app.js");
    mountApp(rootEl);
  } catch (err) {
    console.error("[PRISM] boot failed:", err);
    showFallback(err && err.message ? err.message : String(err));
  }
})();
