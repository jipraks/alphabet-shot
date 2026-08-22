/* ============================================================
   weapon.js — laras, bidik, recoil, letusan, peluru
   Rasa nembak ada di sini. Aturan yang tidak boleh dilanggar:
   - elemen letusan permanen, cukup toggle class (jangan buat-hapus)
   - animasi hanya transform & opacity
   - minimum 250ms antar tembakan (juga penjaga kilatan < 4Hz)
   - getar layar maksimum 3px
   ============================================================ */

const AIM_MAKS = 28;        // derajat
const T_AIM = 120;          // ms
const T_BULLET = 250;       // ms peluru terbang
const T_COOLDOWN = 250;     // ms HARD LIMIT
const T_RELOAD = 800;       // ms
const T_FLASH_TOTAL = 700;  // ms sampai asap selesai

/** Gerbang kilatan global: menjaga <4Hz walau dua pemain menembak barengan. */
let kilatTerakhir = 0;
function bolehKilat(sekarang) {
  if (sekarang - kilatTerakhir < T_COOLDOWN) return false;
  kilatTerakhir = sekarang;
  return true;
}

/** Pool elemen sederhana: jangan createElement di dalam loop. */
export class Pool {
  constructor(induk, kelas, jumlah, siapkan) {
    this.induk = induk;
    this.item = [];
    this.next = 0;
    for (let i = 0; i < jumlah; i += 1) {
      const el = document.createElement('div');
      el.className = kelas;
      if (siapkan) siapkan(el);
      induk.appendChild(el);
      this.item.push(el);
    }
  }

  ambil() {
    const el = this.item[this.next];
    this.next = (this.next + 1) % this.item.length;
    return el;
  }
}

/** SVG cadangan kalau berkas skin tidak bisa dimuat (mis. dibuka lewat file://). */
const SVG_CADANGAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" preserveAspectRatio="xMidYMax meet">
  <path d="M80 30 L120 30 L149 160 L59 160 Z" fill="#6B4226"/>
  <path d="M80 30 L88 30 L104 160 L88 160 Z" fill="#FFF4DC" opacity=".16"/>
  <path d="M68 8 L132 8 L128 36 L72 36 Z" fill="#E0B04A"/>
  <ellipse cx="100" cy="11" rx="15" ry="4" fill="#1B1206"/>
  <rect x="82" y="68" width="36" height="9" rx="4" fill="#D93A3A"/>
</svg>`;

const cacheSkin = new Map();

async function muatSkin(id) {
  if (cacheSkin.has(id)) return cacheSkin.get(id);
  let svg = SVG_CADANGAN;
  try {
    const r = await fetch(`./assets/barrel-${id}.svg`, { cache: 'force-cache' });
    if (r.ok) {
      const t = await r.text();
      if (t.includes('<svg')) svg = t;
    }
  } catch (e) { /* pakai cadangan */ }
  cacheSkin.set(id, svg);
  return svg;
}

export class Weapon {
  /**
   * @param {object} o
   *   el        elemen #weapon
   *   app       elemen acuan koordinat (#app)
   *   fx        lapisan efek di arena (peluru, tracer)
   *   fxTop     lapisan efek paling atas (selongsong)
   *   kios      elemen yang bergetar
   *   kiosFlash overlay kilat kios
   *   ammoEl    wadah gambar peluru
   *   audio     modul audio
   */
  constructor(o) {
    this.el = o.el;
    this.app = o.app;
    this.fx = o.fx;
    this.fxTop = o.fxTop;
    this.kios = o.kios;
    this.kiosFlash = o.kiosFlash;
    this.ammoEl = o.ammoEl || null;
    this.audio = o.audio;

    this.pivot = this.el.querySelector('.w-pivot');
    this.recoilEl = this.el.querySelector('.w-recoil');
    this.barrel = this.el.querySelector('.barrel');

    this.aim = 0;
    this.tembakTerakhir = 0;
    this.sibuk = false;
    this.pelurMaks = 3;
    this.peluru = 3;
    this.tanpaBatas = false;
    this._charge = null;
    this._chargeTimer = null;
    this.charged = false;
    this.skin = 'kayu';

    this.geo = null;
    this._ukurTerjadwal = false;
    this._onResize = () => this.jadwalUkur();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    // Pool efek (dibuat sekali, dipakai ulang)
    this.poolPeluru = new Pool(this.fx, 'bullet', 4);
    this.poolTracer = new Pool(this.fx, 'tracer', 4);
    this.poolShell = new Pool(this.fxTop, 'shell', 4);

    this._bersihFlash = null;
    this.el.addEventListener('animationend', (e) => {
      if (e.target.classList.contains('smoke') && e.target.classList.contains('s3')) {
        this.el.classList.remove('firing');
      }
    });

    this.jadwalUkur();
  }

  /* ---------- Geometri (dibaca sekali, di-cache; jangan di dalam rAF) ---------- */
  jadwalUkur() {
    if (this._ukurTerjadwal) return;
    this._ukurTerjadwal = true;
    requestAnimationFrame(() => {
      this._ukurTerjadwal = false;
      this.ukurUlang();
    });
  }

  ukurUlang() {
    const aim = this.aim;
    this.pivot.style.transition = 'none';
    this.pivot.style.transform = 'rotate(0deg)';
    const appR = this.app.getBoundingClientRect();
    const wR = this.el.getBoundingClientRect();
    const muzzle = this.el.querySelector('.muzzle');
    const mR = muzzle.getBoundingClientRect();
    // transform-origin .w-pivot = 50% 260% dari tinggi laras
    const P = {
      x: wR.left - appR.left + wR.width * 0.5,
      y: wR.top - appR.top + wR.height * 2.6,
    };
    const M0 = { x: mR.left - appR.left, y: mR.top - appR.top };
    this.geo = { P, M0, app: { w: appR.width, h: appR.height } };
    // pulihkan sudut
    this.pivot.style.transform = `rotate(${aim}deg)`;
    requestAnimationFrame(() => { this.pivot.style.transition = ''; });
  }

  /** Posisi moncong sekarang (hitung analitik dari sudut, tanpa baca layout). */
  posisiMoncong(sudutDeg = this.aim) {
    if (!this.geo) this.ukurUlang();
    const { P, M0 } = this.geo;
    const r = (sudutDeg * Math.PI) / 180;
    const dx = M0.x - P.x;
    const dy = M0.y - P.y;
    return {
      x: P.x + dx * Math.cos(r) - dy * Math.sin(r),
      y: P.y + dx * Math.sin(r) + dy * Math.cos(r),
    };
  }

  /** Sudut yang dibutuhkan untuk membidik titik (koordinat #app). */
  sudutKe(x, y) {
    if (!this.geo) this.ukurUlang();
    const { P, M0 } = this.geo;
    const a0 = Math.atan2(M0.x - P.x, -(M0.y - P.y));
    const at = Math.atan2(x - P.x, -(y - P.y));
    let deg = ((at - a0) * 180) / Math.PI;
    if (deg > AIM_MAKS) deg = AIM_MAKS;
    if (deg < -AIM_MAKS) deg = -AIM_MAKS;
    return deg;
  }

  /* ---------- Skin ---------- */
  async setSkin(id) {
    this.skin = id || 'kayu';
    const svg = await muatSkin(this.skin);
    this.barrel.innerHTML = svg;
    const s = this.barrel.querySelector('svg');
    if (s) {
      s.setAttribute('preserveAspectRatio', 'xMidYMax meet');
      s.removeAttribute('width');
      s.removeAttribute('height');
    }
    this.jadwalUkur();
  }

  /* ---------- Peluru (visual 3 gambar di meja) ---------- */
  setPelurMaks(n, { tanpaBatas = false } = {}) {
    this.pelurMaks = n;
    this.tanpaBatas = tanpaBatas;
    this.peluru = n;
    this.gambarAmmo();
  }

  gambarAmmo() {
    if (!this.ammoEl) return;
    if (this.tanpaBatas) { this.ammoEl.innerHTML = ''; return; }
    if (this.ammoEl.children.length !== this.pelurMaks) {
      this.ammoEl.innerHTML = '';
      for (let i = 0; i < this.pelurMaks; i += 1) {
        const d = document.createElement('div');
        d.className = 'peluru';
        this.ammoEl.appendChild(d);
      }
    }
    [...this.ammoEl.children].forEach((el, i) => {
      el.classList.toggle('kosong', i >= this.peluru);
    });
  }

  async isiUlang({ senyap = false } = {}) {
    this.peluru = this.pelurMaks;
    this.el.classList.add('reloading');
    if (!senyap) this.audio?.klikReload();
    const anak = this.ammoEl ? [...this.ammoEl.children] : [];
    anak.forEach((el, i) => {
      setTimeout(() => {
        el.classList.remove('kosong');
        el.classList.add('isi-ulang');
        setTimeout(() => el.classList.remove('isi-ulang'), 280);
      }, 220 + i * 160);
    });
    await tunggu(T_RELOAD);
    this.el.classList.remove('reloading');
    this.gambarAmmo();
  }

  get kosong() { return !this.tanpaBatas && this.peluru <= 0; }

  bisaTembak() {
    return !this.sibuk && !this.kosong &&
      (performance.now() - this.tembakTerakhir >= T_COOLDOWN);
  }

  /* ---------- Bidik ---------- */
  /** Bidik ke titik; jangan snap — keterlambatan kecil membuat senjata terasa berat. */
  arahkan(x, y) {
    const deg = this.sudutKe(x, y);
    this.aim = deg;
    this.pivot.style.transform = `rotate(${deg}deg)`;
    return deg;
  }

  /* ---------- Tembak ---------- */
  /**
   * Satu siklus penuh: bidik (120ms) → letusan → peluru terbang (250ms).
   * @returns {Promise<boolean>} true kalau tembakan benar-benar terjadi
   */
  async tembak(x, y, { pakaiPeluru = true } = {}) {
    if (!this.bisaTembak()) return false;
    this.sibuk = true;
    this.tembakTerakhir = performance.now();
    if (pakaiPeluru && !this.tanpaBatas) {
      this.peluru = Math.max(0, this.peluru - 1);
      this.gambarAmmo();
    }

    const deg = this.arahkan(x, y);
    await tunggu(T_AIM);              // biarkan laras sampai dulu

    this.letusan(deg, x, y);
    await tunggu(T_BULLET);           // peluru terbang: "menembak", bukan "menyentuh"
    this.sibuk = false;
    return true;
  }

  /** Semua lapisan letusan + getar + tracer + selongsong. */
  letusan(deg, tx, ty) {
    const m = this.posisiMoncong(deg);
    const boleh = bolehKilat(performance.now());
    this.audio?.tembak();

    // Arah recoil mengikuti arah bidik: bidik kiri → recoil putar kanan
    const rk = deg <= 0 ? 6 : -6;
    this.el.style.setProperty('--rk', `${rk}deg`);
    this.el.classList.remove('recoil');
    void this.el.offsetWidth;         // paksa restart animasi (sekali, di luar rAF)
    this.el.classList.add('recoil');

    if (boleh) {
      this.el.classList.remove('firing');
      void this.el.offsetWidth;
      this.el.classList.add('firing');
      clearTimeout(this._bersihFlash);
      this._bersihFlash = setTimeout(() => this.el.classList.remove('firing'), T_FLASH_TOTAL);

      // kilat seluruh kios
      this.kiosFlash.classList.remove('on');
      void this.kiosFlash.offsetWidth;
      this.kiosFlash.classList.add('on');

      // getar layar (maks 3px, dimatikan kalau kurangi gerak)
      if (!document.body.classList.contains('kurangi-gerak')) {
        this.kios.classList.remove('getar');
        void this.kios.offsetWidth;
        this.kios.classList.add('getar');
      }
      this.tracer(m, { x: tx, y: ty });
    }

    this.peluruTerbang(m, { x: tx, y: ty });
    this.selongsong(m);
  }

  tracer(dari, ke) {
    const el = this.poolTracer.ambil();
    const dx = ke.x - dari.x;
    const dy = ke.y - dari.y;
    const panjang = Math.hypot(dx, dy);
    const sudut = (Math.atan2(dy, dx) * 180) / Math.PI;
    el.style.left = `${dari.x}px`;
    el.style.top = `${dari.y}px`;
    el.style.width = `${panjang}px`;
    el.style.transform = `rotate(${sudut}deg)`;
    el.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 60, delay: 20, easing: 'linear', fill: 'none' },
    );
  }

  /** Titik terang yang mengecil (perspektif menjauh). */
  peluruTerbang(dari, ke) {
    const el = this.poolPeluru.ambil();
    el.style.left = '0px';
    el.style.top = '0px';
    el.animate([
      { transform: `translate(${dari.x}px, ${dari.y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${(dari.x + ke.x) / 2}px, ${(dari.y + ke.y) / 2}px) scale(0.7)`, opacity: 0.95, offset: 0.5 },
      { transform: `translate(${ke.x}px, ${ke.y}px) scale(0.34)`, opacity: 0.9 },
    ], { duration: T_BULLET, easing: 'linear', fill: 'none' });
  }

  selongsong(dari) {
    const el = this.poolShell.ambil();
    const a = el.animate([
      { transform: `translate(${dari.x}px, ${dari.y}px) rotate(0deg)`, opacity: 1, offset: 0 },
      { transform: `translate(${dari.x + 70}px, ${dari.y - 30}px) rotate(360deg)`, opacity: 1, offset: 0.42 },
      { transform: `translate(${dari.x + 120}px, ${dari.y + 150}px) rotate(720deg)`, opacity: 0.2, offset: 1 },
    ], { duration: 800, delay: 100, easing: 'cubic-bezier(.35,.05,.7,1)', fill: 'none' });
    a.onfinish = () => this.audio?.selongsong();
  }

  /* ---------- Charge shot ---------- */
  mulaiCharge() {
    if (this.charged || this._charge) return;
    this.el.classList.add('charging');
    this._charge = this.audio?.charge?.() || null;
    this._chargeTimer = setTimeout(() => {
      this.charged = true;
      this.el.classList.remove('charging');
      this.el.classList.add('charged');
    }, 1000);
  }

  batalCharge() {
    clearTimeout(this._chargeTimer);
    this._chargeTimer = null;
    if (this._charge) { this._charge.stop(); this._charge = null; }
    this.el.classList.remove('charging', 'charged');
    const siap = this.charged;
    this.charged = false;
    return siap;
  }

  /* ---------- Posisi (dua pemain satu layar) ---------- */
  setPosisi(mode) {
    this.el.classList.remove('p1-duo', 'p2');
    if (mode === 'p1') this.el.classList.add('p1-duo');
    if (mode === 'p2') this.el.classList.add('p2');
    this.jadwalUkur();
  }

  hancurkan() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
  }
}

export function tunggu(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export { T_AIM, T_BULLET, T_COOLDOWN, T_RELOAD, AIM_MAKS };
