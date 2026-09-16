// src/lib/accessControl.js

// Nama-nama yang diizinkan mengakses Panel Supervisor.
// Dicocokkan lowercase + trim (tidak sensitif kapitalisasi/spasi).
export const SUPERVISOR_WHITELIST = [
  "ferri efendi",
  "arif wardani",
  "desi setia pamuji",
  "widya sekarwangi",
  "ade triani",
  "ayu ariani",
  "arpah mustopa",
  "rahmawati"
];

export function isSupervisorWhitelisted(nama) {
  return SUPERVISOR_WHITELIST.includes(String(nama || "").trim().toLowerCase());
}
