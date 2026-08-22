/* ============================================================
   round.js — mesin satu perintah (dipakai semua mode)
   Loop inti: perintah → balon melayang → anak menembak →
   feedback → perintah berikutnya. Maksimal 3 peluru.

   Prinsip yang dijaga di sini:
   - tidak ada hukuman: salah tembak tidak mengurangi nyawa
   - selalu berhasil pada akhirnya: bantuan bertingkat + auto solve
   - gagal karena belum kenal huruf, bukan karena jari (aim assist)

   Catatan: modul ini tidak ada di daftar berkas spek, tapi tanpa
   satu mesin perintah bersama, empat mode akan menyalin logika
   yang sama empat kali.
   ============================================================ */

import { pilihPengecoh, pilihTarget, kolamHuruf, tierHuruf, ejaan, PAKET_TIER } from './letters.js';
import { tunggu } from './weapon.js';

const BANTUAN_DENYUT = 6000;
const BANTUAN_SOROT = 10000;
const BANTUAN_SELESAIKAN = 14000;
const TAP_PENDEK = 350;      // ms: di bawah ini dianggap tap biasa
const CHARGE_PENUH = 1000;   // ms tahan untuk charge shot

/** Perintah suara: "Tembak huruf kecilnya… De!" */
function narasiPerintah(besar) {
  return `Tembak huruf kecilnya. ${ejaan(besar)}!`;
}

export class MesinRonde {
  /**
   * @param {object} ctx { app, arena, weapon, field, ui, audio, progress, stats }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this._lepasInput = null;
  }

  get appRect() { return this.ctx.app.getBoundingClientRect(); }

  /** Koordinat pointer/tap dalam arena dan dalam #app. */
  koordinat(ev) {
    const ar = this.ctx.field.rect;
    const app = this.appRect;
    return {
      arenaX: ev.clientX - ar.left,
      arenaY: ev.clientY - ar.top,
      appX: ev.clientX - app.left,
      appY: ev.clientY - app.top,
    };
  }

  /** Pilih target + pengecoh untuk satu perintah. */
  susunBalon({ paket, tierAktif, jumlahBalon, hindari, sedangSulit }) {
    const kolam = kolamHuruf(paket, tierAktif);
    const target = pilihTarget(kolam, sedangSulit, hindari);
    const tierPaket = PAKET_TIER[paket] || [1];
    const tier = tierPaket.includes(4) ? 4 : tierHuruf(target);
    const pengecoh = pilihPengecoh(target, Math.max(1, jumlahBalon - 1), { paket, tier });
    const daftar = [{ huruf: target.toLowerCase(), benar: true },
      ...pengecoh.map((h) => ({ huruf: h, benar: false }))];
    // kocok posisi supaya balon benar tidak selalu urutan pertama
    for (let i = daftar.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [daftar[i], daftar[j]] = [daftar[j], daftar[i]];
    }
    return { target, daftar };
  }

  /**
   * Jalankan satu perintah sampai selesai.
   * @returns {Promise<{target, benar, firstTry, otomatis, ms, tembakan}>}
   */
  async perintah(o = {}) {
    const {
      weapon, field, ui, audio, stats, progress, arena,
    } = this.ctx;
    const paket = o.paket ?? progress.data.paket;
    const tierAktif = o.tierAktif ?? progress.setelan.tier_aktif;
    const jumlahBalon = o.jumlahBalon ?? 5;
    const bantuan = o.bantuan !== false;
    const slowmo = !!o.slowmo;
    const bolehCharge = !!o.bolehCharge && progress.chargeTerbuka();

    // Isi ulang kalau tidak penuh (jeda pendingin yang disengaja)
    if (!weapon.tanpaBatas && weapon.peluru < weapon.pelurMaks) await weapon.isiUlang();
    field.ukurUlang();

    // Jepit jumlah balon ke kapasitas layar: lebih baik 4 balon lega daripada
    // 8 balon tumpang tindih (kegagalan harus karena huruf, bukan karena jari).
    const muat = Math.max(4, Math.min(jumlahBalon, field.kapasitas()));
    const { target, daftar } = o.susunan || this.susunBalon({
      paket, tierAktif, jumlahBalon: muat, hindari: o.hindari, sedangSulit: (h) => stats.sulit(h),
    });
    ui.perintahTampil(target, o.label || 'Tembak huruf kecilnya!');
    field.ukurUlang();          // ukur SETELAH kartu perintah tampil
    field.spawn(daftar);
    audio.resetCombo();
    audio.katakanHuruf(target, narasiPerintah(target), { prioritas: true });
    if (o.onMulai) o.onMulai({ target, daftar });

    const mulai = performance.now();
    let tembakan = 0;
    let selesai = null;         // 'benar' | 'otomatis' | 'bot' | 'batal'
    let resolusi;
    const habis = new Promise((r) => { resolusi = r; });

    /* ---------- Bantuan bertingkat ---------- */
    const timer = [];
    if (bantuan) {
      timer.push(setTimeout(() => field.denyut(true), BANTUAN_DENYUT));
      timer.push(setTimeout(() => field.sorot(true), BANTUAN_SOROT));
      timer.push(setTimeout(() => this._selesaikanSendiri('Ini dia'), BANTUAN_SELESAIKAN));
    }

    /* ---------- Penyelesaian otomatis (selalu berhasil pada akhirnya) ---------- */
    this._selesaikanSendiri = async (kata = 'Ini dia') => {
      if (selesai) return;
      selesai = 'otomatis';
      timer.forEach(clearTimeout);
      const b = field.benar();
      if (!b) { resolusi(); return; }
      while (weapon.sibuk) await tunggu(60);
      const app = this.appRect;
      const p = field.pusatApp(b, app);
      audio.katakan(`${kata}, ${ejaan(target)} kecil!`, { prioritas: true });
      await weapon.tembak(p.x, p.y, { pakaiPeluru: false });
      await this._kena(b, { slowmo, otomatis: true });
      resolusi();
    };

    /* ---------- Kena / meleset ---------- */
    this._kena = async (b, opt = {}) => {
      const slot = ui.slotEl(b.huruf.toUpperCase());
      if (opt.slowmo) ui.zoomKamera(true);
      const janji = field.pecahkan(b, { slotEl: slot, slowmo: opt.slowmo });
      ui.kedipSlot(b.huruf.toUpperCase());
      if (!opt.senyapNarasi) {
        audio.katakan(opt.otomatis ? '' : `Betul! ${ejaan(b.huruf)} kecil!`);
      }
      await janji;
      if (opt.slowmo) ui.zoomKamera(false);
    };

    /* ---------- Tembakan pemain ---------- */
    const tembak = async (arenaX, arenaY, { charged = false } = {}) => {
      if (selesai) return;
      if (!weapon.bisaTembak()) return;
      const app = this.appRect;
      const appX = arenaX + field.rect.left - app.left;
      const appY = arenaY + field.rect.top - app.top;
      const sasaran = field.cari(arenaX, arenaY);   // aim assist 40px

      // Tap jauh dari semua balon: jangan hitung sebagai jawaban salah.
      // Laras tetap menembak supaya rasa nembaknya utuh.
      if (!sasaran) {
        await weapon.tembak(appX, appY, { pakaiPeluru: false });
        return;
      }

      const pusat = field.pusatApp(sasaran, app);
      tembakan += 1;
      const jadi = await weapon.tembak(pusat.x, pusat.y);
      if (!jadi) { tembakan -= 1; return; }
      if (selesai) return;

      if (charged) {
        // Charge shot: semua balon dengan huruf yang benar meledak sekaligus
        const benarSemua = field.semuaBenar();
        if (benarSemua.length) {
          selesai = 'benar';
          timer.forEach(clearTimeout);
          audio.fanfare();
          await Promise.all(benarSemua.map((b, i) => tunggu(i * 90).then(() => this._kena(b, { slowmo, senyapNarasi: i > 0 }))));
          if (o.catat !== false) {
            stats.catat(target, { benar: true, firstTry: tembakan === 1, ms: performance.now() - mulai });
            ui.segarSlot(target);
          }
          resolusi();
          return;
        }
      }

      if (sasaran.benar) {
        selesai = 'benar';
        timer.forEach(clearTimeout);
        field.bersihBantuan();
        await this._kena(sasaran, { slowmo });
        if (o.catat !== false) {
          stats.catat(target, { benar: true, firstTry: tembakan === 1, ms: performance.now() - mulai });
          ui.segarSlot(target);
        }
        if (o.onBenar) o.onBenar({ target, tembakan });
        resolusi();
        return;
      }

      // Salah: peluru memantul, tanpa komentar negatif, tanpa teks "Salah"
      field.pantul(sasaran);
      if (o.catat !== false) stats.catat(target, { benar: false });
      if (o.onSalah) o.onSalah({ target, huruf: sasaran.huruf });
      if (weapon.kosong && !selesai) {
        // Peluru habis: jangan tampilkan kegagalan, selesaikan sendiri
        await tunggu(320);
        this._selesaikanSendiri('Ini dia');
      }
    };

    /* ---------- Input: pointer + papan tombol ---------- */
    const lepas = this.pasangInput(arena, tembak, { bolehCharge });
    this._lepasInput = lepas;

    /* ---------- Hook mode (mis. bot duel) ---------- */
    if (o.pengendali) {
      o.pengendali({
        target,
        selesaiOlehBot: async (kata) => {
          if (selesai) return false;
          selesai = 'bot';
          timer.forEach(clearTimeout);
          const b = field.benar();
          if (b) await this._kena(b, { senyapNarasi: true, otomatis: true });
          if (kata) audio.katakan(kata);
          resolusi();
          return true;
        },
        balonBenar: () => field.benar(),
        batal: () => { if (!selesai) { selesai = 'batal'; timer.forEach(clearTimeout); resolusi(); } },
        sudahSelesai: () => !!selesai,
      });
    }

    await habis;
    timer.forEach(clearTimeout);
    lepas();
    field.bersihBantuan();

    const hasil = {
      target,
      benar: selesai === 'benar',
      firstTry: selesai === 'benar' && tembakan === 1,
      otomatis: selesai === 'otomatis',
      olehBot: selesai === 'bot',
      ms: performance.now() - mulai,
      tembakan,
    };
    if (hasil.otomatis && o.catat !== false) {
      // Huruf tetap masuk rak, tapi tidak dihitung sebagai jawaban benar
      stats.catat(target, { otomatis: true });
      ui.segarSlot(target);
    }
    return hasil;
  }

  /**
   * Pasang input untuk satu perintah.
   * charge terbuka → tembak saat lepas (tahan 1 detik = charge shot);
   * charge terkunci → tembak langsung saat sentuh (paling responsif).
   */
  pasangInput(arena, tembak, { bolehCharge = false, filterPemain = null, papanTombol = true } = {}) {
    const { weapon } = this.ctx;
    const tekan = new Map();

    const onDown = (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      const k = this.koordinat(ev);
      if (filterPemain && !filterPemain(k, ev)) return;
      if (!bolehCharge) { tembak(k.arenaX, k.arenaY); return; }
      tekan.set(ev.pointerId, { t: performance.now(), k, chargeMulai: false });
      const rec = tekan.get(ev.pointerId);
      rec.timer = setTimeout(() => {
        rec.chargeMulai = true;
        // sisa waktu supaya charge penuh tepat 1 detik sejak mulai menekan
        weapon.mulaiCharge(CHARGE_PENUH - TAP_PENDEK);
      }, TAP_PENDEK);
    };

    const onUp = (ev) => {
      const rec = tekan.get(ev.pointerId);
      if (!rec) return;
      tekan.delete(ev.pointerId);
      clearTimeout(rec.timer);
      const lama = performance.now() - rec.t;
      const penuh = weapon.batalCharge();
      const k = this.koordinat(ev);
      const pakai = (lama < TAP_PENDEK) ? rec.k : k;
      tembak(pakai.arenaX, pakai.arenaY, { charged: penuh && lama >= CHARGE_PENUH });
    };

    const onCancel = (ev) => {
      const rec = tekan.get(ev.pointerId);
      if (rec) { clearTimeout(rec.timer); tekan.delete(ev.pointerId); }
      weapon.batalCharge();
    };

    // Papan tombol A–Z: berguna untuk anak yang lebih besar dan untuk testing
    const onKey = (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const h = (ev.key || '').toLowerCase();
      if (!/^[a-z]$/.test(h)) return;
      const b = this.ctx.field.hidup().find((x) => x.huruf.toLowerCase() === h);
      if (!b) return;
      ev.preventDefault();
      tembak(b.rx + b.w / 2, b.ry + b.w / 2);
    };

    arena.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    if (papanTombol) window.addEventListener('keydown', onKey);

    return () => {
      arena.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (papanTombol) window.removeEventListener('keydown', onKey);
      tekan.forEach((r) => clearTimeout(r.timer));
      tekan.clear();
    };
  }

  /** Bintang berdasarkan akurasi, bukan kecepatan. Selalu minimal 1. */
  static bintang(hasil) {
    const total = hasil.length;
    if (!total) return 1;
    const firstTry = hasil.filter((h) => h.firstTry).length;
    const benar = hasil.filter((h) => h.benar).length;
    if (firstTry === total) return 3;
    if (benar >= Math.ceil(total * 0.8)) return 2;
    return 1;
  }
}

export { BANTUAN_DENYUT, BANTUAN_SOROT, BANTUAN_SELESAIKAN, narasiPerintah };
