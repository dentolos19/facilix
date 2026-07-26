const SHOW_ALL_FACILITIES_KEY = "facilix.show-all-facilities";

export function getShowAllFacilitiesPreference(userId: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(`${SHOW_ALL_FACILITIES_KEY}.${userId}`) === "true";
}

export function setShowAllFacilitiesPreference(userId: string, enabled: boolean) {
  window.localStorage.setItem(`${SHOW_ALL_FACILITIES_KEY}.${userId}`, String(enabled));
}
