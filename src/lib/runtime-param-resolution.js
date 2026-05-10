/**
 * Pure URL + plain-object store resolution (browser-free contract tests).
 * Matches browser semantics: URLSearchParams.get missing → null; present empty → "";
 * defaults use !== undefined so 0 / false / "" persist.
 */

function readStoreKeys(storageKeys, store) {
  for (const key of storageKeys) {
    if (!Object.prototype.hasOwnProperty.call(store, key)) continue;
    const value = store[key];
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function writeStoreKeys(storageKeys, store, value) {
  const serialized = value === null || value === undefined ? "" : String(value);
  for (const key of storageKeys) {
    store[key] = serialized;
  }
}

export function resolveRuntimeParamValue(paramName, search, storageKeys, store, defaultValue) {
  const urlParams = new URLSearchParams(search);
  const searchParam = urlParams.get(paramName);

  if (searchParam !== null) {
    writeStoreKeys(storageKeys, store, searchParam);
    return searchParam;
  }

  if (defaultValue !== undefined) {
    writeStoreKeys(storageKeys, store, defaultValue);
    return defaultValue;
  }

  return readStoreKeys(storageKeys, store);
}
