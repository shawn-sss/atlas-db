import { SIDEBAR_PREFS_KEY_PREFIX } from "../constants/app";
import { apiFetch } from "../api/client";
import ROUTES from "../api/routes";
const buildPrefsKey = (user, localKey) =>
  localKey || `${SIDEBAR_PREFS_KEY_PREFIX}:${user?.username || "guest"}`;

export async function getPrefs(user, localKey) {
  const key = buildPrefsKey(user, localKey);
  if (user) {
    try {
      const data = await apiFetch(ROUTES.userPrefs);
      return data || {};
    } catch (err) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function savePrefs(user, prefs, localKey) {
  const key = buildPrefsKey(user, localKey);
  if (user) {
    try {
      await apiFetch(ROUTES.userPrefs, { method: "PUT", body: prefs });
      return true;
    } catch (err) {
      try {
        window.localStorage.setItem(key, JSON.stringify(prefs));
        return true;
      } catch {
        return false;
      }
    }
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

export default { getPrefs, savePrefs };
