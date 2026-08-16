// Storage that cannot take the page down.
//
// `localStorage` throws outright in a few common situations — Safari lockdown
// mode, embedded webviews, "block all cookies", private windows at quota — and
// the stored JSON can be corrupt for reasons outside our control. Every read
// and write in the store goes through here so a broken key degrades to an
// in-memory fallback instead of an uncaught exception.

function makeSafe(pick) {
  const memory = new Map();
  let live = null; // lazily probed: true = real storage usable

  const probe = () => {
    if (live !== null) return live;
    try {
      const store = pick();
      const k = '__cp_probe__';
      store.setItem(k, '1');
      store.removeItem(k);
      live = true;
    } catch {
      live = false;
    }
    return live;
  };

  return {
    get available() {
      return probe();
    },
    get(key) {
      if (probe()) {
        try {
          const value = pick().getItem(key);
          return value === null ? (memory.has(key) ? memory.get(key) : null) : value;
        } catch {
          /* fall through to memory */
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    /** @returns {boolean} true when the value survived beyond this page load. */
    set(key, value) {
      memory.set(key, value);
      if (!probe()) return false;
      try {
        pick().setItem(key, value);
        return true;
      } catch {
        return false; // quota, or storage revoked mid-session
      }
    },
    remove(key) {
      memory.delete(key);
      if (!probe()) return;
      try {
        pick().removeItem(key);
      } catch {
        /* nothing we can do, and nothing worth throwing over */
      }
    },
  };
}

export const safeStorage = makeSafe(() => window.localStorage);
export const safeSession = makeSafe(() => window.sessionStorage);

/** Parse a stored JSON value, dropping (and clearing) anything corrupt. */
export function readJSON(store, key, fallback) {
  const raw = store.get(key);
  if (raw === null || raw === undefined) return fallback;
  try {
    const value = JSON.parse(raw);
    return value === null || value === undefined ? fallback : value;
  } catch {
    store.remove(key); // corrupt beyond use — start clean rather than throw
    return fallback;
  }
}

/** @returns {boolean} true when the value was durably written. */
export function writeJSON(store, key, value) {
  try {
    return store.set(key, JSON.stringify(value));
  } catch {
    return false; // circular / unserialisable value: never the caller's crash
  }
}
