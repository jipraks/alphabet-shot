/* ============================================================
   progress.js — penyimpanan localStorage (berversi + migrasi)
   Pemilik kunci: th:progress, th:settings, th:sessions.
   Anak akan memakai ini berbulan-bulan: setiap perubahan bentuk
   data harus lewat migrasi, jangan menghapus data lama.
   ============================================================ */

import { ALFABET } from './letters.js';

const K_PROGRESS = 'th:progress';
const K_SETTINGS = 'th:settings';
const K_SESSIONS = 'th:sessions';
const VERSI = 1;
const MAKS_SESI = 30;

export const SKIN = [
  { id: 'kayu',    nama: 'Kayu',       emoji: '🪵', syarat: () => true, ket: 'bawaan' },
  { id: 'pelangi', nama: 'Pelangi',    emoji: '🌈', syarat: (p) => p.jumlahTingkat('kenal', true) >= 5,  ket: '5 huruf dikenal' },
  { id: 'dino',    nama: 'Dinosaurus', emoji: '🦖', syarat: (p) => p.data.paket >= 3,                    ket: 'selesai Paket 2' },
  { id: 'eskrim',  nama: 'Es krim',    emoji: '🍦', syarat: (p) => p.data.duel_menang >= 3,              ket: 'menang Duel 3x' },
  { id: 'roket',   nama: 'Roket',      emoji: '🚀', syarat: (p) => p.jumlahTingkat('hafal') >= 13,       ket: '13 huruf dihafal' },
  { id: 'emas',    nama: 'Emas',       emoji: '🏆', syarat: (p) => p.rakLengkap(),                       ket: 'rak hadiah penuh' },
];

function bacaJSON(kunci, bawaan) {
  try {
    const t = localStorage.getItem(kunci);
    if (!t) return bawaan;
    const v = JSON.parse(t);
    return v == null ? bawaan : v;
  } catch (e) {
    return bawaan;
  }
}

function tulisJSON(kunci, nilai) {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
    return true;
  } catch (e) {
    return false; // mode privat / kuota penuh: game harus tetap jalan
  }
}

function progressBaru() {
  return {
    version: VERSI,
    paket: 1,
    ronde_selesai: 0,
    huruf: {},
    skin_terbuka: ['kayu'],
    skin_aktif: 'kayu',
    duel_menang: 0,
    bintang_terakhir: [],   // riwayat bintang untuk naik/turun paket
  };
}

function setelanBaru() {
  return {
    mode_suara: 'nama',        // 'nama' | 'bunyi'
    tier_aktif: [1, 2, 3, 4],
    musik: false,              // default mati (spek)
    getar: true,
    reduced_motion: null,      // null = ikut sistem
    pengingat_istirahat: true,
    bisu: false,
  };
}

function hurufBaru() {
  return { benar: 0, salah: 0, first_try: 0, tingkat: 'belum', dikumpulkan: 0, waktu_ms: 0, waktu_n: 0 };
}

/** Migrasi bertahap. Tambahkan `if (d.version < N)` untuk versi berikutnya. */
function migrasiProgress(d) {
  if (!d || typeof d !== 'object') return progressBaru();
  const bawaan = progressBaru();
  if (typeof d.version !== 'number') d.version = 1;
  // Isi field yang belum ada (aman untuk data dari versi lebih tua)
  Object.keys(bawaan).forEach((k) => { if (d[k] === undefined) d[k] = bawaan[k]; });
  if (!Array.isArray(d.skin_terbuka) || !d.skin_terbuka.length) d.skin_terbuka = ['kayu'];
  if (!d.skin_terbuka.includes('kayu')) d.skin_terbuka.unshift('kayu');
  if (!SKIN.some((s) => s.id === d.skin_aktif)) d.skin_aktif = 'kayu';
  if (!Array.isArray(d.bintang_terakhir)) d.bintang_terakhir = [];
  if (typeof d.huruf !== 'object' || !d.huruf) d.huruf = {};
  Object.keys(d.huruf).forEach((h) => {
    d.huruf[h] = Object.assign(hurufBaru(), d.huruf[h]);
  });
  d.paket = Math.min(4, Math.max(1, Number(d.paket) || 1));
  d.version = VERSI;
  return d;
}

function migrasiSetelan(s) {
  const bawaan = setelanBaru();
  if (!s || typeof s !== 'object') return bawaan;
  Object.keys(bawaan).forEach((k) => { if (s[k] === undefined) s[k] = bawaan[k]; });
  if (!Array.isArray(s.tier_aktif) || !s.tier_aktif.length) s.tier_aktif = bawaan.tier_aktif;
  s.tier_aktif = s.tier_aktif.map(Number).filter((t) => t >= 1 && t <= 4);
  if (!s.tier_aktif.length) s.tier_aktif = bawaan.tier_aktif;
  if (s.mode_suara !== 'bunyi') s.mode_suara = 'nama';
  return s;
}

class Progress {
  constructor() {
    this.data = migrasiProgress(bacaJSON(K_PROGRESS, null));
    this.setelan = migrasiSetelan(bacaJSON(K_SETTINGS, null));
    this.sesi = Array.isArray(bacaJSON(K_SESSIONS, [])) ? bacaJSON(K_SESSIONS, []) : [];
    this._pendengar = new Set();
    this.simpan();
  }

  /* ---------- Simpan / muat ---------- */
  simpan() {
    tulisJSON(K_PROGRESS, this.data);
    tulisJSON(K_SETTINGS, this.setelan);
    tulisJSON(K_SESSIONS, this.sesi.slice(-MAKS_SESI));
  }

  simpanSesi(daftar) {
    this.sesi = daftar.slice(-MAKS_SESI);
    tulisJSON(K_SESSIONS, this.sesi);
  }

  dengar(fn) { this._pendengar.add(fn); return () => this._pendengar.delete(fn); }

  _kabari(apa) { this._pendengar.forEach((fn) => { try { fn(apa); } catch (e) { /* abaikan */ } }); }

  /* ---------- Setelan ---------- */
  setSetelan(kunci, nilai) {
    this.setelan[kunci] = nilai;
    tulisJSON(K_SETTINGS, this.setelan);
    this._kabari({ jenis: 'setelan', kunci, nilai });
  }

  /* ---------- Huruf ---------- */
  huruf(besar) {
    const h = String(besar).toUpperCase();
    if (!this.data.huruf[h]) this.data.huruf[h] = hurufBaru();
    return this.data.huruf[h];
  }

  /** Hitung tingkat: belum → kenal (terkumpul) → hafal (5x benar, >=3 first try). */
  hitungTingkat(besar) {
    const r = this.huruf(besar);
    if (r.benar >= 5 && r.first_try >= 3) return 'hafal';
    if (r.benar >= 1 || r.dikumpulkan >= 1) return 'kenal';
    return 'belum';
  }

  tingkat(besar) { return this.huruf(besar).tingkat || 'belum'; }

  /**
   * Catat satu jawaban.
   * @param {string} besar huruf target
   * @param {object} o { benar, firstTry, ms, otomatis }
   *   otomatis = diselesaikan laras sendiri: masuk rak, TIDAK dihitung benar.
   */
  catat(besar, { benar = false, firstTry = false, ms = 0, otomatis = false } = {}) {
    const r = this.huruf(besar);
    const sebelum = r.tingkat;
    if (otomatis) {
      r.dikumpulkan += 1;
    } else if (benar) {
      r.benar += 1;
      r.dikumpulkan += 1;
      if (firstTry) r.first_try += 1;
      if (ms > 0) { r.waktu_ms += ms; r.waktu_n += 1; }
    } else {
      r.salah += 1;
    }
    r.tingkat = this.hitungTingkat(besar);
    tulisJSON(K_PROGRESS, this.data);
    return { tingkatSebelum: sebelum, tingkatSekarang: r.tingkat, naik: sebelum !== r.tingkat };
  }

  jumlahTingkat(tingkat, atauLebih = false) {
    const urut = { belum: 0, kenal: 1, hafal: 2 };
    const batas = urut[tingkat] ?? 0;
    return ALFABET.filter((h) => {
      const t = urut[this.tingkat(h)] ?? 0;
      return atauLebih ? t >= batas : t === batas;
    }).length;
  }

  rakLengkap() { return ALFABET.every((h) => this.tingkat(h) !== 'belum'); }

  hurufTerkumpul() { return ALFABET.filter((h) => this.tingkat(h) !== 'belum'); }

  /* ---------- Ronde & paket ---------- */
  /**
   * Ronde selesai. Menaikkan paket kalau 2 ronde berturut-turut 3 bintang,
   * menurunkan kalau 2 ronde berturut-turut 1 bintang (diam-diam).
   */
  selesaiRonde({ bintang = 1 } = {}) {
    this.data.ronde_selesai += 1;
    const riwayat = this.data.bintang_terakhir;
    riwayat.push(bintang);
    if (riwayat.length > 6) riwayat.shift();

    let naik = false;
    let turun = false;
    const dua = riwayat.slice(-2);
    if (dua.length === 2 && dua.every((b) => b === 3) && this.data.paket < 4) {
      this.data.paket += 1;
      naik = true;
      this.data.bintang_terakhir = [];
    } else if (dua.length === 2 && dua.every((b) => b === 1) && this.data.paket > 1) {
      this.data.paket -= 1;
      turun = true;                       // jangan diumumkan ke anak
      this.data.bintang_terakhir = [];
    }
    tulisJSON(K_PROGRESS, this.data);
    return { naik, turun, paket: this.data.paket };
  }

  catatDuelMenang() {
    this.data.duel_menang += 1;
    tulisJSON(K_PROGRESS, this.data);
  }

  /* ---------- Skin ---------- */
  /** Buka skin yang syaratnya sudah terpenuhi; kembalikan yang baru terbuka. */
  cekSkin() {
    const baru = [];
    SKIN.forEach((s) => {
      if (this.data.skin_terbuka.includes(s.id)) return;
      let ok = false;
      try { ok = !!s.syarat(this); } catch (e) { ok = false; }
      if (ok) { this.data.skin_terbuka.push(s.id); baru.push(s); }
    });
    if (baru.length) tulisJSON(K_PROGRESS, this.data);
    return baru;
  }

  skinTerbuka(id) { return this.data.skin_terbuka.includes(id); }

  pilihSkin(id) {
    if (!this.skinTerbuka(id)) return false;
    this.data.skin_aktif = id;
    tulisJSON(K_PROGRESS, this.data);
    this._kabari({ jenis: 'skin', id });
    return true;
  }

  /* ---------- Mode terbuka ---------- */
  modeTerbuka(mode) {
    if (mode === 'serbuan') return this.data.paket >= 3;   // selesai Paket 2
    if (mode === 'bos') return this.data.paket >= 4;
    return true;
  }

  chargeTerbuka() { return this.data.paket >= 3; }

  /* ---------- Reset ---------- */
  reset() {
    this.data = progressBaru();
    this.sesi = [];
    tulisJSON(K_PROGRESS, this.data);
    tulisJSON(K_SESSIONS, this.sesi);
    this._kabari({ jenis: 'reset' });
  }

  ekspor() {
    return {
      dibuat: new Date().toISOString(),
      progress: this.data,
      setelan: this.setelan,
      sesi: this.sesi,
    };
  }
}

export const progress = new Progress();
export { K_PROGRESS, K_SETTINGS, K_SESSIONS, VERSI };
