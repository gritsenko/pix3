/**
 * Lazy loader for `@dimforge/rapier3d`.
 *
 * The editor itself does not use rapier — it is only exposed to user-authored
 * project scripts via `window.__RAPIER__` and the runtime importmap shim.
 *
 * Loading is deferred until just before user scripts are about to execute, so
 * sessions that never run a game (or whose scripts do not import rapier) never
 * pay the download cost. The non-compat package loads its wasm as a separate
 * file (handled by `vite-plugin-wasm`), avoiding the ~500 KB base64 overhead
 * of `rapier3d-compat`.
 */

type RapierNamespace = Record<string, unknown> & { default?: unknown };

interface WindowWithRapier extends Window {
  __RAPIER__?: RapierNamespace;
}

let loadingPromise: Promise<RapierNamespace> | null = null;

export function ensureRapierLoaded(): Promise<RapierNamespace> {
  const win = window as WindowWithRapier;
  if (win.__RAPIER__) {
    return Promise.resolve(win.__RAPIER__);
  }

  if (!loadingPromise) {
    // Explicit subpath: `@dimforge/rapier3d` package.json declares only
    // `module` (no `main`/`exports`), which Vite's package-entry resolver
    // rejects. Pointing at the entry file directly sidesteps that and the
    // wasm plugin handles the cascading `*.wasm` import.
    loadingPromise = import('@dimforge/rapier3d/rapier.js').then(mod => {
      const source = ((mod as unknown as RapierNamespace).default ?? mod) as RapierNamespace;
      // Module namespace objects are frozen, so clone into a plain object
      // before patching. We add a no-op `init()` for backwards compatibility
      // with user code written against `@dimforge/rapier3d-compat`: that
      // package exposes an explicit `init()` to load its inlined base64
      // wasm, while the non-compat package initializes wasm via TLA inside
      // the module itself — by the time this dynamic import resolves, wasm
      // is already ready, so `init` becomes a resolved-promise stub.
      const namespace: RapierNamespace = { ...source };
      if (typeof namespace.init !== 'function') {
        namespace.init = () => Promise.resolve();
      }
      win.__RAPIER__ = namespace;
      return namespace;
    });
  }

  return loadingPromise;
}
