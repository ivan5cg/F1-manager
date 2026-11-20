// Ciclo de vida de la PWA: registro del service worker, aviso de nueva versión e instalación.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
let wantReload = false;
let reloading = false;
let initialized = false;

function notifyInstall() {
  for (const fn of installListeners) fn();
}

function showUpdateBanner(worker: ServiceWorker) {
  if (document.getElementById("updban")) return;
  const bar = document.createElement("div");
  bar.id = "updban";
  bar.className = "updban";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span class="grow small">Nueva versión disponible</span><button class="yellow" id="updgo">Actualizar</button><button id="updx" aria-label="Cerrar">✕</button>`;
  document.body.appendChild(bar);
  const go = bar.querySelector<HTMLButtonElement>("#updgo")!;
  go.onclick = () => {
    go.disabled = true;
    wantReload = true;
    worker.postMessage("SKIP_WAITING");
  };
  bar.querySelector<HTMLButtonElement>("#updx")!.onclick = () => bar.remove();
}

/** Arranca el manejo de instalación y actualizaciones de la PWA (seguro llamarlo una sola vez). */
export function initPwa(buildId: string) {
  if (initialized) return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyInstall();
  });

  const okHost = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !okHost) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!wantReload || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register(`sw.js?v=${buildId}`).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(nw);
      });
    });
  }).catch(() => { /* sin service worker */ });
}

/** ¿El navegador ofrece en este momento instalar la app directamente? */
export const canInstall = () => !!deferredPrompt;

/** Abre el cuadro nativo de instalación; devuelve si el usuario aceptó. */
export async function promptInstall(): Promise<boolean> {
  const p = deferredPrompt;
  if (!p) return false;
  deferredPrompt = null;
  notifyInstall();
  try {
    await p.prompt();
    const res = await p.userChoice;
    return res.outcome === "accepted";
  } catch {
    return false;
  }
}

/** Suscribe un callback a cambios en la disponibilidad de instalación; devuelve función para cancelar. */
export function onInstallChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => { installListeners.delete(fn); };
}
