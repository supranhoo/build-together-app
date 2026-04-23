export const ACTIVE_PROFIT_CENTER_KEY = "steelflow:active-profit-center";

export function getActiveProfitCenterPreference() {
  return localStorage.getItem(ACTIVE_PROFIT_CENTER_KEY);
}

export function setActiveProfitCenterPreference(profitCenterId: string) {
  localStorage.setItem(ACTIVE_PROFIT_CENTER_KEY, profitCenterId);
}

export function clearActiveProfitCenterPreference() {
  localStorage.removeItem(ACTIVE_PROFIT_CENTER_KEY);
}
