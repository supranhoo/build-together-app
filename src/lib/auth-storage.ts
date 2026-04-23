export const REMEMBER_ME_KEY = "steelflow:remember-me";

function getPreferredStorage() {
  const preference = localStorage.getItem(REMEMBER_ME_KEY);
  return preference === "false" ? sessionStorage : localStorage;
}

export function getRememberPreference() {
  return localStorage.getItem(REMEMBER_ME_KEY) !== "false";
}

export function setRememberPreference(remember: boolean) {
  localStorage.setItem(REMEMBER_ME_KEY, remember ? "true" : "false");
}

export const authStorage = {
  getItem(key: string) {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    const target = getPreferredStorage();
    const secondary = target === localStorage ? sessionStorage : localStorage;
    target.setItem(key, value);
    secondary.removeItem(key);
  },
  removeItem(key: string) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};
