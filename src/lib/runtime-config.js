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

const toSnakeCase = (str) => str.replace(/([A-Z])/g, "_$1").toLowerCase();

const readStorage = (keys) => {
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value) {
      return value;
    }
  }
  return null;
};

const writeStorage = (keys, value) => {
  keys.forEach((key) => storage.setItem(key, value));
};

const removeStorage = (keys) => {
  keys.forEach((key) => storage.removeItem(key));
};

const ACCESS_TOKEN_STORAGE_KEYS = ["app_access_token", "token"];

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

  if (searchParam) {
    writeStorage(storageKeys, searchParam);
    return searchParam;
  }

  if (defaultValue) {
    writeStorage(storageKeys, defaultValue);
    return defaultValue;
  }

  return readStorage(storageKeys);
};

const getRuntimeConfig = () => {
  if (getRuntimeParamValue("clear_access_token") === "true") {
    removeStorage(ACCESS_TOKEN_STORAGE_KEYS);
  }

  return {
    appId: getRuntimeParamValue("app_id", {
      defaultValue: import.meta.env.VITE_APP_ID,
      storageKeys: ["app_app_id"],
    }),
    token: getRuntimeParamValue("access_token", {
      removeFromUrl: true,
      storageKeys: ["app_access_token", "token"],
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

export const authTokenStorageKeys = ACCESS_TOKEN_STORAGE_KEYS;

export const setRuntimeAccessToken = (token) => {
  if (isNode) {
    return;
  }

  if (!token) {
    removeStorage(ACCESS_TOKEN_STORAGE_KEYS);
    return;
  }

  writeStorage(ACCESS_TOKEN_STORAGE_KEYS, token);
};

export const clearRuntimeAccessToken = () => {
  if (isNode) {
    return;
  }

  removeStorage(ACCESS_TOKEN_STORAGE_KEYS);
};
