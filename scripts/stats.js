/* ============================================================
   stats.js — pencatatan & agregasi statistik
   Menulis lewat progress (satu sumber kebenaran untuk penyimpanan),
   memiliki daftar sesi untuk grafik panel orang tua.
   ============================================================ */

import { progress } from './progress.js';
import { ALFABET } from './letters.js';

function tanggalHariIni() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Senin sebagai awal minggu. */
function awalMingguISO() {
  const d = new Date();
  const hari = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - hari);
  d.setHours(0, 0, 0, 0);
  return d;
}

class Stats {
  constructor() {
    this.sesiIdx = -1;          // posisi entri sesi ini di progress.sesi
    this.sesiBenar = 0;
    this.sesiTotal = 0;
    this.sesiDurasi = 0;
    this.salahTerakhir = [];    // huruf yang baru-baru ini salah (memori saja)
    this.rondeBerturut = 0;     // untuk pengingat istirahat
  }

  /* ---------- Pencatatan ---------- */
  /**
   * @param {string} besar huruf target
   * @param {object} o { benar, firstTry, ms, otomatis }
   */
  catat(besar, o = {}) {
    const hasil = progress.catat(besar, o);
    // Akurasi sesi dihitung per TEMBAKAN (sama seperti akurasi per huruf),
    // supaya angka di panel orang tua konsisten.
    this.sesiTotal += 1;
    if (o.benar && !o.otomatis) {
      this.sesiBenar += 1;
      this.salahTerakhir = this.salahTerakhir.filter((h) => h !== besar);
    } else if (!o.otomatis) {
      this.salahTerakhir.unshift(besar);
      this.salahTerakhir = this.salahTerakhir.slice(0, 10);
    }
    return hasil;
  }

  /** Huruf yang sedang sering salah → bobot 2x sebagai target. */
  sulit(besar) {
    const r = progress.huruf(besar);
    const total = r.benar + r.salah;
    if (this.salahTerakhir.includes(String(besar).toUpperCase())) return true;
    if (total >= 2 && r.benar / total < 0.7) return true;
    return r.salah >= 2 && r.benar === 0;
  }

  /* ---------- Sesi ---------- */
  catatRonde({ durasiDetik = 0 } = {}) {
    this.sesiDurasi += Math.max(0, Math.round(durasiDetik));
    this.rondeBerturut += 1;
    const daftar = progress.sesi.slice();
    const akurasi = this.sesiTotal ? Number((this.sesiBenar / this.sesiTotal).toFixed(3)) : 0;
    const entri = {
      tanggal: tanggalHariIni(),
      ronde: this.sesiIdx >= 0 && daftar[this.sesiIdx] ? (daftar[this.sesiIdx].ronde || 0) + 1 : 1,
      akurasi,
      durasi_detik: this.sesiDurasi,
    };
    if (this.sesiIdx >= 0 && daftar[this.sesiIdx]) {
      daftar[this.sesiIdx] = entri;
    } else {
      daftar.push(entri);
      this.sesiIdx = daftar.length - 1;
    }
    progress.simpanSesi(daftar);
    // simpanSesi bisa memangkas 30 entri terakhir: sesuaikan indeks
    this.sesiIdx = progress.sesi.length - 1;
  }

  resetRondeBerturut() { this.rondeBerturut = 0; }

  /* ---------- Agregasi untuk panel orang tua ---------- */
  perHuruf() {
    return ALFABET.map((h) => {
      const r = progress.huruf(h);
      const percobaan = r.benar + r.salah;
      return {
        huruf: h,
        percobaan,
        benar: r.benar,
        salah: r.salah,
        first_try: r.first_try,
        akurasi: percobaan ? r.benar / percobaan : null,
        rata_ms: r.waktu_n ? Math.round(r.waktu_ms / r.waktu_n) : null,
        tingkat: progress.tingkat(h),
      };
    });
  }

  /** 5 huruf yang paling sering salah, diurutkan dari paling sulit. */
  tersulit(n = 5) {
    return this.perHuruf()
      .filter((r) => r.salah > 0)
      .sort((a, b) => (b.salah - a.salah) || ((a.akurasi ?? 1) - (b.akurasi ?? 1)))
      .slice(0, n);
  }

  /** Akurasi 7 sesi terakhir (untuk grafik). */
  grafikSesi(n = 7) {
    return progress.sesi.slice(-n).map((s) => ({
      tanggal: s.tanggal,
      akurasi: Number(s.akurasi) || 0,
      ronde: s.ronde || 0,
      durasi_detik: s.durasi_detik || 0,
    }));
  }

  waktuHariIni() {
    const t = tanggalHariIni();
    return progress.sesi
      .filter((s) => s.tanggal === t)
      .reduce((a, s) => a + (s.durasi_detik || 0), 0);
  }

  waktuMingguIni() {
    const awal = awalMingguISO();
    return progress.sesi
      .filter((s) => {
        const d = new Date(`${s.tanggal}T00:00:00`);
        return !Number.isNaN(d.getTime()) && d >= awal;
      })
      .reduce((a, s) => a + (s.durasi_detik || 0), 0);
  }

  totalPercobaan() {
    return this.perHuruf().reduce((a, r) => a + r.percobaan, 0);
  }

  akurasiKeseluruhan() {
    const rows = this.perHuruf();
    const benar = rows.reduce((a, r) => a + r.benar, 0);
    const total = rows.reduce((a, r) => a + r.percobaan, 0);
    return total ? benar / total : null;
  }

  ekspor() {
    return {
      ...progress.ekspor(),
      ringkasan: {
        akurasi_keseluruhan: this.akurasiKeseluruhan(),
        total_percobaan: this.totalPercobaan(),
        per_huruf: this.perHuruf(),
        tersulit: this.tersulit(5),
        waktu_hari_ini_detik: this.waktuHariIni(),
        waktu_minggu_ini_detik: this.waktuMingguIni(),
      },
    };
  }
}

export const stats = new Stats();
export { tanggalHariIni };
