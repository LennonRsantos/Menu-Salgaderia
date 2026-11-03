// Marks a device where someone of the team opened the panel, so the storefront
// asks the server whether to show the "Painel" button only there; customers
// never trigger that check. It is only a hint: the server decides.

const KEY = "menu:staff";

export function markStaff() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // storage unavailable: the storefront just won't offer the shortcut
  }
}

export function clearStaff() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function hasStaffHint() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
