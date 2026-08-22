/* ============================================================
   letters.js — data kurikulum
   Tier, tabel pengecoh jebakan, aturan pemilihan pengecoh,
   dan ejaan nama huruf untuk TTS bahasa Indonesia.
   Tidak ada DOM di file ini: murni data + fungsi.
   ============================================================ */

/** Tier 1 — bentuk sama, cuma beda ukuran. */
export const TIER1 = ['C', 'O', 'S', 'V', 'W', 'X', 'Z', 'K', 'U', 'P'];
/** Tier 2 — mirip, ada pembeda kecil. */
export const TIER2 = ['I', 'J', 'T', 'Y', 'F'];
/** Tier 3 — bentuk berbeda total. Inti kurikulum. */
export const TIER3 = ['A', 'B', 'D', 'E', 'G', 'H', 'M', 'N', 'Q', 'R', 'L'];

/** Tabel pasangan jebakan (kunci & isi dalam huruf kecil). */
export const JEBAKAN = {
  b: ['d', 'p', 'q'],
  d: ['b', 'p', 'q'],
  p: ['q', 'b', 'd'],
  q: ['p', 'b', 'd'],
  m: ['n', 'w'],
  n: ['m', 'u', 'h'],
  u: ['n', 'v'],
  i: ['l', 'j'],
  l: ['i', 'j', 't'],
  a: ['e', 'o'],
  g: ['q', 'y'],
};

/** Tier 4 — bukan huruf baru, tapi target dari tabel jebakan. */
export const TIER4 = Object.keys(JEBAKAN).map((h) => h.toUpperCase());

export const TIERS = { 1: TIER1, 2: TIER2, 3: TIER3, 4: TIER4 };

/** Paket → tier yang dipakai. */
export const PAKET_TIER = { 1: [1], 2: [1, 2], 3: [2, 3], 4: [3, 4] };

/** Ronde ke berapa mulai paket berikutnya (acuan awal, lalu adaptif). */
export const PAKET_RONDE = { 1: 0, 2: 3, 3: 6, 4: 10 };

export const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Kemiripan visual tambahan di luar tabel jebakan.
 * Dipakai untuk MENOLAK pengecoh di tier 1–2 (spek: "bentuk jelas
 * berbeda dari target"), bukan untuk memilihnya.
 */
const MIRIP = {
  c: ['o', 'e', 's', 'g'],
  o: ['c', 'e', 'a', 'q'],
  s: ['c', 'z'],
  v: ['w', 'y', 'u'],
  w: ['v', 'm', 'u'],
  x: ['y', 'k'],
  z: ['s', 'x'],
  k: ['x', 'h'],
  t: ['f', 'l', 'i'],
  f: ['t'],
  y: ['v', 'x', 'g'],
  j: ['i', 'l'],
  e: ['a', 'c', 'o'],
  h: ['n', 'k', 'b'],
  r: ['n', 'v'],
};

/** Semua huruf yang dianggap mirip dengan `kecil` (jebakan + kemiripan). */
export function serupa(kecil) {
  const k = kecil.toLowerCase();
  return new Set([...(JEBAKAN[k] || []), ...(MIRIP[k] || [])]);
}

/** Tier tempat sebuah huruf besar berada (1–3; tier 4 dicek terpisah). */
export function tierHuruf(besar) {
  if (TIER1.includes(besar)) return 1;
  if (TIER2.includes(besar)) return 2;
  if (TIER3.includes(besar)) return 3;
  return 3;
}

/**
 * Kolam huruf target untuk sebuah paket.
 * @param {number} paket 1–4
 * @param {number[]} tierAktif tier yang diizinkan orang tua
 */
export function kolamHuruf(paket, tierAktif = [1, 2, 3, 4]) {
  const tiers = PAKET_TIER[Math.min(4, Math.max(1, paket))] || [1];
  let dipakai = tiers.filter((t) => tierAktif.includes(t));
  if (!dipakai.length) dipakai = tiers; // jangan pernah kosong
  const set = new Set();
  dipakai.forEach((t) => TIERS[t].forEach((h) => set.add(h)));
  return [...set];
}

/** Semua huruf yang boleh jadi pengecoh untuk sebuah paket (tier 1–3). */
function kolamPengecoh(tierMaks) {
  const set = new Set();
  for (let t = 1; t <= Math.min(3, tierMaks); t += 1) TIERS[t].forEach((h) => set.add(h));
  return [...set];
}

function acak(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function kocok(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pilih huruf target. Huruf yang sedang sering salah muncul 2x lebih sering.
 * @param {string[]} kolam huruf besar
 * @param {(besar:string)=>boolean} sedangSulit
 * @param {string|null} hindari huruf terakhir (jangan langsung berulang)
 */
export function pilihTarget(kolam, sedangSulit = () => false, hindari = null) {
  let pilihan = kolam.filter((h) => h !== hindari);
  if (!pilihan.length) pilihan = kolam.slice();
  const bobot = [];
  pilihan.forEach((h) => {
    bobot.push(h);
    if (sedangSulit(h)) bobot.push(h); // bobot 2x
  });
  return acak(bobot);
}

/**
 * Pilih pengecoh sesuai aturan spek.
 * @param {string} target huruf besar
 * @param {number} jumlah banyaknya pengecoh
 * @param {object} opt { paket, tier }
 * @returns {string[]} huruf kecil, tanpa duplikat, tanpa target
 */
export function pilihPengecoh(target, jumlah, opt = {}) {
  const kecil = target.toLowerCase();
  const paket = opt.paket || 1;
  const tier = opt.tier || tierHuruf(target);
  const tierMaks = Math.max(...(PAKET_TIER[paket] || [1]), tier === 4 ? 3 : tier);
  const jebak = (JEBAKAN[kecil] || []).slice();
  const hasil = [];
  const pakai = (h) => {
    const l = h.toLowerCase();
    if (l === kecil || hasil.includes(l)) return false;
    hasil.push(l);
    return true;
  };

  const tier4 = tier === 4 || (paket === 4 && jebak.length);
  const wajibJebakan = tier4 ? 2 : (tier === 3 ? 1 : 0);

  // 1. Kuota pengecoh jebakan
  kocok(jebak).forEach((h) => {
    if (hasil.length < Math.min(wajibJebakan, jumlah)) pakai(h);
  });

  // 2. Sisanya
  if (tier <= 2 && !tier4) {
    // Tier 1–2: dari tier yang sama, bentuk jelas berbeda
    const tolak = serupa(kecil);
    const sekolam = kocok(TIERS[tier].map((h) => h.toLowerCase()));
    sekolam.forEach((h) => {
      if (hasil.length < jumlah && !tolak.has(h)) pakai(h);
    });
    // Kalau masih kurang (tier 2 hanya 5 huruf), ambil dari tier 1–2 lain
    kocok(kolamPengecoh(2).map((h) => h.toLowerCase())).forEach((h) => {
      if (hasil.length < jumlah && !tolak.has(h)) pakai(h);
    });
  } else {
    // Tier 3–4: acak dari tier 1–3
    kocok(kolamPengecoh(tierMaks).map((h) => h.toLowerCase())).forEach((h) => {
      if (hasil.length < jumlah) pakai(h);
    });
  }

  // 3. Jaring pengaman: jangan pernah mengembalikan kurang dari yang diminta
  kocok(ALFABET.map((h) => h.toLowerCase())).forEach((h) => {
    if (hasil.length < jumlah) pakai(h);
  });

  return hasil.slice(0, jumlah);
}

/* ---------- Ejaan nama huruf untuk TTS id-ID ----------
   Jangan pernah mengirim huruf tunggal ke speechSynthesis:
   "D" sering dibaca cara Inggris ("dii"). Kirim ejaan namanya. */
export const EJAAN = {
  A: 'a',  B: 'be', C: 'ce',  D: 'de', E: 'e',   F: 'ef',
  G: 'ge', H: 'ha', I: 'i',   J: 'je', K: 'ka',  L: 'el',
  M: 'em', N: 'en', O: 'o',   P: 'pe', Q: 'ki',  R: 'er',
  S: 'es', T: 'te', U: 'u',   V: 've', W: 'we',  X: 'eks',
  Y: 'ye', Z: 'zet',
};

export function ejaan(besar) {
  return EJAAN[String(besar).toUpperCase()] || String(besar).toLowerCase();
}

/** Warna balon (rotasi, tanpa merah). */
export const WARNA_BALON = [
  'var(--balon-1)', 'var(--balon-2)', 'var(--balon-3)',
  'var(--balon-4)', 'var(--balon-5)',
];

/** Warna tetap per huruf supaya boneka di rak konsisten. */
export function warnaHuruf(besar) {
  const i = ALFABET.indexOf(String(besar).toUpperCase());
  return WARNA_BALON[(i < 0 ? 0 : i) % WARNA_BALON.length];
}

export { kocok as kocokArray, acak as acakDari };
