/* ============================================================
   balloons.js — spawn, tata letak, gerak, hit detection
   Balon melayang pelan dan TIDAK PERNAH keluar layar: tidak ada
   mekanik "keburu kabur" yang menciptakan tekanan waktu.
   Hit detection memakai aim assist 40px dari tepi balon.
   ============================================================ */

import { Pool } from './weapon.js';
import { warnaHuruf } from './letters.js';

const V_MIN = 12;   // px/detik
const V_MAKS = 20;  // px/detik
const CONFETTI_MAKS = 60;
const CONFETTI_PER_BALON = 16;

function rnd(a, b) { return a + Math.random() * (b - a); }

export class BalloonField {
  constructor({ arena, fx, fxTop, audio }) {
    this.arena = arena;
    this.lapisan = arena.querySelector('#balloons');
    this.fx = fx;
    this.fxTop = fxTop;
    this.audio = audio;

    this.balon = [];
    this.jalan = false;
    this._raf = 0;
    this._t = 0;
    this.ukuran = { w: 100, h: 116 };
    this.rect = { w: 0, h: 0, left: 0, top: 0 };
    this.amanAtas = 0;
    this.larasEl = null;
    this.zona = null;   // kotak larangan di bawah-tengah: balon tidak boleh
                        // bersembunyi di belakang laras

    this.poolConfetti = new Pool(this.fx, 'confetti', CONFETTI_MAKS);
    this.poolHuruf = new Pool(this.fxTop, 'huruf-terbang', 6, (el) => { el.style.opacity = '0'; });

    this._onResize = () => this.ukurUlang();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.ukurUlang();
  }

  /* ---------- Geometri (di-cache, tidak dibaca di dalam rAF) ---------- */
  ukurUlang() {
    const r = this.arena.getBoundingClientRect();
    this.rect = { w: r.width, h: r.height, left: r.left, top: r.top };
    const probe = this.arena.querySelector('#ukur-balon');
    const w = probe ? (probe.offsetWidth || 100) : 100;
    this.ukuran = { w, h: w * 1.16 };
    this.gap = parseFloat(getComputedStyle(this.arena).getPropertyValue('--balon-gap')) || 24;
    this.assist = parseFloat(getComputedStyle(this.arena).getPropertyValue('--aim-assist')) || 40;
    this.zona = this._hitungZona();
    const perintah = this.arena.querySelector('#perintah');
    const pr = perintah ? perintah.getBoundingClientRect() : null;
    this.amanAtas = pr ? Math.max(0, pr.bottom - r.top + 8) : 8;
    // jaga semua balon tetap di dalam area setelah resize
    this.balon.forEach((b) => {
      b.x = Math.min(Math.max(0, b.x), Math.max(0, this.rect.w - this.ukuran.w));
      b.y = Math.min(Math.max(this.amanAtas, b.y), Math.max(this.amanAtas, this.rect.h - this.ukuran.h));
    });
  }

  /** Laras yang harus dihindari balon (dipasang sekali dari main.js). */
  setLaras(el) {
    this.larasEl = el;
    this.zona = this._hitungZona();
  }

  /**
   * Kotak larangan dalam koordinat arena: sebesar laras plus ruang untuk
   * rotasi +-28 derajat. Dibaca sekali saat resize, bukan di dalam rAF.
   */
  _hitungZona() {
    if (!this.larasEl) return null;
    const r = this.larasEl.getBoundingClientRect();
    if (!r.width) return null;
    const lega = r.width * 0.35;             // sapuan saat laras berputar
    const x1 = r.left - this.rect.left - lega;
    const x2 = r.right - this.rect.left + lega;
    const y1 = r.top - this.rect.top - 8;    // sedikit di atas moncong
    if (y1 >= this.rect.h) return null;      // laras tidak masuk arena
    return { x1, x2, y1: Math.max(this.amanAtas, y1) };
  }

  /** Geser posisi ke atas zona larangan kalau perlu. */
  _hindariZona(x, y, w, h) {
    const z = this.zona;
    if (!z) return y;
    const cx = x + w / 2;
    if (cx < z.x1 || cx > z.x2) return y;
    if (y + h <= z.y1) return y;
    return Math.max(this.amanAtas, z.y1 - h);
  }

  get lebarBalon() { return this.ukuran.w; }

  /**
   * Berapa balon yang benar-benar muat tanpa tumpang tindih.
   * Dipakai untuk menjepit jumlah balon di layar kecil: balon minimal 80px
   * dan jarak 24px tidak boleh dikompromikan (aim assist harus jelas).
   */
  kapasitas() {
    const w = this.ukuran.w;
    const h = this.ukuran.h;
    const gap = this.gap || 24;
    const bawah = this.zona ? Math.max(0, this.rect.h - this.zona.y1) : 0;
    const kolom = Math.floor(this.rect.w / (w + gap));
    const baris = Math.floor((this.rect.h - this.amanAtas - bawah * 0.5) / (h + 8));
    return Math.max(3, kolom * Math.max(1, baris));
  }

  /* ---------- Spawn ---------- */
  /**
   * @param {Array<{huruf:string, benar:boolean, bos?:boolean}>} daftar
   */
  spawn(daftar) {
    this.bersihkan();
    const slot = this._slotGrid(daftar.length, daftar.some((d) => d.bos));
    daftar.forEach((d, i) => this.tambah(d, i, slot[i]));
    this.mulai();
    return this.balon;
  }

  /**
   * Bagi area jadi petak lalu beri jitter di dalam petak. Ini menjamin balon
   * tidak tumpang tindih selama petaknya cukup — rejection sampling acak gagal
   * di layar kecil (mis. HP landscape) yang nyaris penuh.
   */
  _slotGrid(n, adaBos = false) {
    const w = this.ukuran.w;
    const h = this.ukuran.h;
    const atas = this.amanAtas;
    const W = Math.max(w, this.rect.w);
    const H = Math.max(h, this.rect.h - atas);
    if (adaBos) return new Array(n).fill(null);
    const kolom = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * W) / Math.max(1, H)))));
    const baris = Math.ceil(n / kolom);
    const cw = W / kolom;
    const ch = H / baris;
    const petak = [];
    for (let r = 0; r < baris; r += 1) {
      for (let c = 0; c < kolom; c += 1) petak.push({ c, r });
    }
    // kocok petak supaya balon benar tidak selalu di tempat yang sama
    for (let i = petak.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [petak[i], petak[j]] = [petak[j], petak[i]];
    }
    return petak.slice(0, n).map(({ c, r }) => {
      const jitterX = Math.max(0, cw - w);
      const jitterY = Math.max(0, ch - h);
      const x = Math.min(Math.max(0, this.rect.w - w), c * cw + rnd(0, jitterX));
      const y = Math.min(Math.max(atas, this.rect.h - h), atas + r * ch + rnd(0, jitterY));
      return { x, y: this._hindariZona(x, y, w, h) };
    });
  }

  tambah(d, urutan = this.balon.length, posisi = null) {
    const el = document.createElement('button');
    el.className = 'balon' + (d.bos ? ' bos' : '');
    el.type = 'button';
    el.tabIndex = -1;
    el.setAttribute('aria-hidden', 'true');
    const warna = d.bos ? 'var(--balon-3)' : warnaHuruf(d.huruf);
    el.style.setProperty('--warna', warna);
    el.innerHTML = `<span class="karet"><span class="huruf"></span></span><span class="tali"></span>`;
    el.querySelector('.huruf').textContent = d.huruf;

    const besar = d.bos ? 2.1 : 1;
    const w = this.ukuran.w * besar;
    const h = this.ukuran.h * besar;
    const pos = posisi || this._cariTempat(w, h, d.bos);
    const sudut = rnd(0, Math.PI * 2);
    const v = rnd(V_MIN, V_MAKS);

    const b = {
      el,
      huruf: d.huruf,
      benar: !!d.benar,
      bos: !!d.bos,
      hidup: true,
      w,
      h,
      x: pos.x,
      y: pos.y,
      vx: d.bos ? 0 : Math.cos(sudut) * v,
      vy: d.bos ? 0 : Math.sin(sudut) * v,
      fase: rnd(0, Math.PI * 2),
      ampl: d.bos ? 4 : rnd(3, 7),
      rx: pos.x,
      ry: pos.y,
    };
    this.balon.push(b);
    this.lapisan.appendChild(el);
    this._gambar(b);
    el.animate(
      [{ transform: `${el.style.transform} scale(0.2)`, opacity: 0 }, { transform: el.style.transform, opacity: 1 }],
      { duration: 260, delay: Math.min(urutan * 45, 360), easing: 'cubic-bezier(0.22,1.4,0.36,1)' },
    );
    return b;
  }

  /** Tata letak: jarak antar balon minimal 24px supaya aim assist tidak ambigu. */
  _cariTempat(w, h, tengah = false) {
    const maksX = Math.max(0, this.rect.w - w);
    const atas = this.amanAtas;
    const maksY = Math.max(atas, this.rect.h - h);
    if (tengah) return { x: maksX / 2, y: atas + (maksY - atas) / 2 };
    const gapCSS = this.gap || 24;
    const jarakKe = (x, y) => {
      let min = Infinity;
      this.balon.forEach((b) => {
        if (!b.hidup) return;
        const d = Math.hypot((b.x + b.w / 2) - (x + w / 2), (b.y + b.w / 2) - (y + w / 2));
        if (d < min) min = d;
      });
      return min;
    };
    // Longgarkan jarak bertahap, tapi JANGAN pernah sampai balon tumpang tindih
    // (aim assist 40px harus tetap jelas milik satu balon).
    for (let relax = 0; relax < 4; relax += 1) {
      const minJarak = w + Math.max(6, gapCSS - relax * 6);
      for (let coba = 0; coba < 70; coba += 1) {
        const x = rnd(0, maksX);
        const y = rnd(atas, maksY);
        const yz = this._hindariZona(x, y, w, h);
        if (jarakKe(x, yz) >= minJarak) return { x, y: yz };
      }
    }
    // Cadangan: ambil kandidat paling lega, bukan asal acak
    let terbaik = { x: rnd(0, maksX), y: rnd(atas, maksY), d: -1 };
    for (let i = 0; i < 40; i += 1) {
      const x = rnd(0, maksX);
      const y = rnd(atas, maksY);
      const d = jarakKe(x, y);
      if (d > terbaik.d) terbaik = { x, y, d };
    }
    return { x: terbaik.x, y: this._hindariZona(terbaik.x, terbaik.y, w, h) };
  }

  bersihkan() {
    this.balon.forEach((b) => b.el.remove());
    this.balon = [];
  }

  /* ---------- Loop gerak ---------- */
  mulai() {
    if (this.jalan) return;
    this.jalan = true;
    this._t = performance.now();
    const langkah = (now) => {
      if (!this.jalan) return;
      const dt = Math.min(0.05, (now - this._t) / 1000);
      this._t = now;
      this._gerak(dt, now / 1000);
      this._raf = requestAnimationFrame(langkah);
    };
    this._raf = requestAnimationFrame(langkah);
  }

  hentikan() {
    this.jalan = false;
    cancelAnimationFrame(this._raf);
  }

  _gerak(dt, t) {
    const { w: aw, h: ah } = this.rect;
    for (let i = 0; i < this.balon.length; i += 1) {
      const b = this.balon[i];
      if (!b.hidup) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // pantul lembut di tepi; balon tidak pernah keluar layar
      const maksX = Math.max(0, aw - b.w);
      const minY = this.amanAtas;
      const maksY = Math.max(minY, ah - b.h);
      if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
      if (b.x >= maksX) { b.x = maksX; b.vx = -Math.abs(b.vx); }
      if (b.y <= minY) { b.y = minY; b.vy = Math.abs(b.vy); }
      if (b.y >= maksY) { b.y = maksY; b.vy = -Math.abs(b.vy); }
      // jangan pernah melayang di belakang laras
      const z = this.zona;
      if (z) {
        const cx = b.x + b.w / 2;
        if (cx > z.x1 && cx < z.x2 && b.y + b.h > z.y1) {
          b.y = Math.max(minY, z.y1 - b.h);
          b.vy = -Math.abs(b.vy);
        }
      }
      // goyangan sinus kecil supaya terasa mengambang
      b.rx = b.x + Math.sin(t * 1.1 + b.fase) * b.ampl;
      b.ry = b.y + Math.cos(t * 0.85 + b.fase) * b.ampl * 0.6;
      this._gambar(b);
    }
    this._pisahkan();
  }

  /**
   * Balon saling menolak lembut supaya jaraknya tidak pernah menutup.
   * Tanpa ini balon melayang saling menembus dan aim assist 40px jadi
   * ambigu — anak menembak balon yang tidak dia maksud.
   */
  _pisahkan() {
    const n = this.balon.length;
    for (let i = 0; i < n; i += 1) {
      const a = this.balon[i];
      if (!a.hidup || a.bos) continue;
      for (let j = i + 1; j < n; j += 1) {
        const c = this.balon[j];
        if (!c.hidup || c.bos) continue;
        const ax = a.x + a.w / 2;
        const ay = a.y + a.w / 2;
        const cx = c.x + c.w / 2;
        const cy = c.y + c.w / 2;
        let dx = cx - ax;
        let dy = cy - ay;
        let d = Math.hypot(dx, dy);
        const minD = (a.w + c.w) / 2 + 12;
        if (d >= minD) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }   // hindari pembagian nol
        const dorong = (minD - d) / 2;
        const nx = (dx / d) * dorong;
        const ny = (dy / d) * dorong;
        a.x -= nx; a.y -= ny;
        c.x += nx; c.y += ny;
        // saling memantul lembut
        if ((c.vx - a.vx) * dx + (c.vy - a.vy) * dy < 0) {
          const tx = a.vx; const ty = a.vy;
          a.vx = c.vx; a.vy = c.vy;
          c.vx = tx; c.vy = ty;
        }
        this._jepit(a);
        this._jepit(c);
        a.rx = a.x; a.ry = a.y;
        c.rx = c.x; c.ry = c.y;
        this._gambar(a);
        this._gambar(c);
      }
    }
  }

  /** Jaga balon tetap di dalam arena dan di luar zona laras. */
  _jepit(b) {
    const maksX = Math.max(0, this.rect.w - b.w);
    const minY = this.amanAtas;
    const maksY = Math.max(minY, this.rect.h - b.h);
    b.x = Math.min(Math.max(0, b.x), maksX);
    b.y = Math.min(Math.max(minY, b.y), maksY);
    const z = this.zona;
    if (z) {
      const cx = b.x + b.w / 2;
      if (cx > z.x1 && cx < z.x2 && b.y + b.h > z.y1) b.y = Math.max(minY, z.y1 - b.h);
    }
  }

  _gambar(b) {
    b.el.style.transform = `translate3d(${b.rx}px, ${b.ry}px, 0)`;
  }

  /* ---------- Hit detection + aim assist ---------- */
  /**
   * @param {number} x koordinat dalam arena
   * @param {number} y
   * @returns {object|null} balon terkena (pusat paling dekat kalau ambigu)
   */
  cari(x, y) {
    const assist = this.assist || 40;
    let pilih = null;
    let terdekat = Infinity;
    this.balon.forEach((b) => {
      if (!b.hidup) return;
      const cx = b.rx + b.w / 2;
      const cy = b.ry + b.w / 2;          // bagian bulat = kotak w x w di atas
      const r = b.w / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r + assist && d < terdekat) { terdekat = d; pilih = b; }
    });
    return pilih;
  }

  /** Posisi tengah balon dalam koordinat #app (arena + offset). */
  pusatApp(b, appRect) {
    return {
      x: this.rect.left - appRect.left + b.rx + b.w / 2,
      y: this.rect.top - appRect.top + b.ry + b.w / 2,
    };
  }

  benar() { return this.balon.find((b) => b.hidup && b.benar) || null; }
  semuaBenar() { return this.balon.filter((b) => b.hidup && b.benar); }
  hidup() { return this.balon.filter((b) => b.hidup); }

  /* ---------- Bantuan bertingkat ---------- */
  denyut(on) {
    const b = this.benar();
    if (b) b.el.classList.toggle('denyut', !!on);
  }

  sorot(on) {
    const benar = this.benar();
    this.balon.forEach((b) => {
      if (!b.hidup) return;
      if (b === benar) b.el.classList.toggle('sorot', !!on);
      else b.el.classList.toggle('redup', !!on);
    });
  }

  bersihBantuan() {
    this.balon.forEach((b) => b.el.classList.remove('denyut', 'sorot', 'redup'));
  }

  /* ---------- Feedback ---------- */
  /** Salah: peluru memantul, balon bergoyang lucu, bunyi boing. Tidak pecah. */
  pantul(b) {
    if (!b || !b.hidup) return;
    b.el.classList.remove('goyang');
    void b.el.offsetWidth;
    b.el.classList.add('goyang');
    this.audio?.boing();
    setTimeout(() => b.el.classList.remove('goyang'), 420);
  }

  /**
   * Benar: balon pecah jadi confetti, huruf terbang ke rak.
   * @param {object} b balon
   * @param {object} o { slotEl, slowmo }
   */
  pecahkan(b, { slotEl = null, slowmo = false } = {}) {
    if (!b || !b.hidup) return Promise.resolve();
    b.hidup = false;
    const skala = slowmo ? 1 / 0.35 : 1;   // slow motion 0.35x kecepatan
    const warna = getComputedStyle(b.el).getPropertyValue('--warna') || 'var(--mint)';
    const cx = b.rx + b.w / 2;
    const cy = b.ry + b.w / 2;

    this.audio?.pop();
    b.el.animate(
      [{ transform: `translate3d(${b.rx}px, ${b.ry}px, 0) scale(1)`, opacity: 1 },
       { transform: `translate3d(${b.rx}px, ${b.ry}px, 0) scale(1.35)`, opacity: 0 }],
      { duration: 140 * skala, easing: 'ease-out' },
    );
    setTimeout(() => { b.el.style.visibility = 'hidden'; }, 130 * skala);

    this._confetti(cx, cy, warna, slowmo ? CONFETTI_PER_BALON * 2 : CONFETTI_PER_BALON, skala);
    return this._hurufKeRak(b, warna, slotEl, skala);
  }

  _confetti(cx, cy, warna, jumlah, skala = 1) {
    const n = Math.min(jumlah, CONFETTI_MAKS);
    for (let i = 0; i < n; i += 1) {
      const el = this.poolConfetti.ambil();
      el.style.setProperty('--warna', warna);
      const sudut = (Math.PI * 2 * i) / n + rnd(-0.25, 0.25);
      const jarak = rnd(40, 130);
      const dx = Math.cos(sudut) * jarak;
      const dy = Math.sin(sudut) * jarak;
      el.animate([
        { transform: `translate(${cx}px, ${cy}px) rotate(0deg) scale(1)`, opacity: 1 },
        { transform: `translate(${cx + dx}px, ${cy + dy * 0.7}px) rotate(${rnd(-240, 240)}deg) scale(0.9)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${cx + dx * 1.15}px, ${cy + dy + 90}px) rotate(${rnd(-420, 420)}deg) scale(0.5)`, opacity: 0 },
      ], { duration: rnd(620, 900) * skala, easing: 'cubic-bezier(.25,.5,.4,1)', fill: 'none' });
    }
  }

  /** Huruf terlepas, terbang melengkung ke rak, mendarat dengan sedikit pantulan. */
  _hurufKeRak(b, warna, slotEl, skala = 1) {
    const el = this.poolHuruf.ambil();
    el.textContent = b.huruf;
    el.style.setProperty('--warna', warna);
    const mulaiX = this.rect.left + b.rx + b.w / 2;
    const mulaiY = this.rect.top + b.ry + b.w / 2;
    let tujuanX = mulaiX;
    let tujuanY = this.rect.top - 40;
    if (slotEl) {
      const r = slotEl.getBoundingClientRect();
      tujuanX = r.left + r.width / 2;
      tujuanY = r.top + r.height / 2;
    }
    const puncakY = Math.min(mulaiY, tujuanY) - 70;
    const durasi = 620 * skala;
    el.style.left = '0';
    el.style.top = '0';
    const a = el.animate([
      { transform: `translate(-50%, -50%) translate(${mulaiX}px, ${mulaiY}px) scale(1)`, opacity: 1, offset: 0 },
      { transform: `translate(-50%, -50%) translate(${(mulaiX + tujuanX) / 2}px, ${puncakY}px) scale(0.8)`, opacity: 1, offset: 0.55 },
      { transform: `translate(-50%, -50%) translate(${tujuanX}px, ${tujuanY - 10}px) scale(0.5)`, opacity: 1, offset: 0.86 },
      { transform: `translate(-50%, -50%) translate(${tujuanX}px, ${tujuanY}px) scale(0.42)`, opacity: 0, offset: 1 },
    ], { duration: durasi, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'none' });
    return new Promise((resolve) => {
      a.onfinish = () => resolve();
      setTimeout(resolve, durasi + 120);
    });
  }

  /** Ganti huruf pada balon (mode bos). */
  setHuruf(b, huruf, benar) {
    b.huruf = huruf;
    b.benar = !!benar;
    const el = b.el.querySelector('.huruf');
    el.textContent = huruf;
    el.animate([{ opacity: 0.2, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 160, easing: 'ease-out' });
  }

  hancurkan() {
    this.hentikan();
    this.bersihkan();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
  }
}
