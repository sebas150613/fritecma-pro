import {
  AUTH_ACCESS_TOKEN_KEYS,
  clearAuthSessionIn,
  getStoredAuthTokenFrom,
  setStoredAuthTokenIn,
} from "./auth-storage.js";

const isNode = typeof window === "undefined";

/** @returns {Storage} */
function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      const v = map.get(key);
      return v === undefined ? null : String(v);
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

const storage = isNode ? createMemoryStorage() : window.localStorage;

/** Keys written by getRuntimeParamValue for URL overrides; cleared with ?clear_access_token=true */
const RUNTIME_OVERRIDE_STORAGE_KEYS = [
  "app_app_id",
  "app_from_url",
  "app_backend_provider",
  "app_api_url",
  "app_login_url",
  "app_logout_url",
];

const clearRuntimeOverrideKeys = (store) => {
  RUNTIME_OVERRIDE_STORAGE_KEYS.forEach((key) => store.removeItem(key));
};

const readStorage = (keys) => {
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value !== null) {
      return value;
    }
  }
  return null;
};

const writeStorage = (keys, value) => {
  const serialized =
    value === null || value === undefined ? "" : String(value);
  keys.forEach((key) => storage.setItem(key, serialized));
};

const removeStorage = (keys) => {
  keys.forEach((key) => storage.removeItem(key));
};

const getRuntimeParamValue = (
  paramName,
  {
    defaultValue = undefined,
    removeFromUrl = false,
    storageKeys = [],
  } = {}
) => {
  if (isNode) {
    return defaultValue;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get(paramName);

  if (removeFromUrl) {
    urlParams.delete(paramName);
    const newUrl = `${window.location.pathname}${
      urlParams.toString() ? `?${urlParams.toString()}` : ""
    }${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);
  }

  if (searchParam !== null) {
    writeStorage(storageKeys, searchParam);
    return searchParam;
  }

  if (defaultValue !== undefined) {
    writeStorage(storageKeys, defaultValue);
    return defaultValue;
  }

  return readStorage(storageKeys);
};

const getRuntimeConfig = () => {
  if (getRuntimeParamValue("clear_access_token") === "true") {
    if (!isNode) {
      clearAuthSessionIn(storage);
      clearRuntimeOverrideKeys(storage);
    }
  }

  return {
    appId: getRuntimeParamValue("app_id", {
      defaultValue: import.meta.env.VITE_APP_ID,
      storageKeys: ["app_app_id"],
    }),
    token: getRuntimeParamValue("access_token", {
      removeFromUrl: true,
      storageKeys: AUTH_ACCESS_TOKEN_KEYS,
    }),
    fromUrl: getRuntimeParamValue("from_url", {
      defaultValue: isNode ? "" : window.location.href,
      storageKeys: ["app_from_url"],
    }),
    backendProvider: getRuntimeParamValue("backend_provider", {
      defaultValue: import.meta.env.VITE_APP_BACKEND_PROVIDER ?? "rest",
      storageKeys: ["app_backend_provider"],
    }),
    apiUrl: getRuntimeParamValue("api_url", {
      defaultValue: import.meta.env.VITE_APP_API_URL ?? "",
      storageKeys: ["app_api_url"],
    }),
    loginUrl: getRuntimeParamValue("login_url", {
      defaultValue: import.meta.env.VITE_APP_LOGIN_URL ?? "",
      storageKeys: ["app_login_url"],
    }),
    logoutUrl: getRuntimeParamValue("logout_url", {
      defaultValue: import.meta.env.VITE_APP_LOGOUT_URL ?? "",
      storageKeys: ["app_logout_url"],
    }),
  };
};

export const runtimeConfig = {
  ...getRuntimeConfig(),
};

export const runtimeStorage = {
  read(keys) {
    return readStorage(keys);
  },
  write(keys, value) {
    writeStorage(keys, value);
  },
  remove(keys) {
    removeStorage(keys);
  },
};

export const authTokenStorageKeys = AUTH_ACCESS_TOKEN_KEYS;

/** Current access token from storage (prefer over runtimeConfig.token after login/org switch). */
export const getStoredAuthToken = () => getStoredAuthTokenFrom(storage);

export const setStoredAuthToken = (token) => {
  if (isNode) {
    return;
  }
  setStoredAuthTokenIn(storage, token);
};

/** Clears token keys and session activity marker (see SESSION_LAST_ACTIVITY_STORAGE_KEY). */
export const clearStoredAuthToken = () => {
  if (isNode) {
    return;
  }
  clearAuthSessionIn(storage);
};

export const setRuntimeAccessToken = setStoredAuthToken;

export const clearRuntimeAccessToken = clearStoredAuthToken;

export { SESSION_LAST_ACTIVITY_STORAGE_KEY } from "./auth-storage.js";
