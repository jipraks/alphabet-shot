/* ============================================================
   audio.js — semua bunyi disintesis WebAudio (nol file aset)
   + suara huruf: rekaman orang tua (IndexedDB) > TTS id-ID > diam.
   Aturan: audio di-unlock oleh gesture pertama, suara perintah
   tidak menimpa feedback (satu antrean), toggle bisu global.
   ============================================================ */

const NADA_POP = [523.25, 587.33, 659.25, 698.46, 783.99]; // C5 D5 E5 F5 G5
const NADA_BINTANG = [523.25, 659.25, 783.99, 1046.5];     // C E G C

/* ---------- IndexedDB untuk blob rekaman ---------- */
const DB_NAMA = 'th-suara';
const DB_STORE = 'huruf';
let dbPromise = null;

function bukaDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB tidak ada')); return; }
    const req = indexedDB.open(DB_NAMA, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

async function dbTulis(kunci, nilai) {
  const db = await bukaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(nilai, kunci);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbBaca(kunci) {
  const db = await bukaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(kunci);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbHapus(kunci) {
  const db = await bukaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(kunci);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbKunci() {
  const db = await bukaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

class AudioKios {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.musik = null;
    this.bisu = false;
    this.musikNyala = false;
    this.modeSuara = 'nama';        // 'nama' | 'bunyi'
    this.combo = 0;
    this.ttsSiap = false;
    this.suaraID = null;            // SpeechSynthesisVoice id-ID
    this._antrean = [];
    this._sedangBicara = false;
    this._bufferRekaman = new Map();
    this._musikTimer = null;
    this._pantauSuara();
  }

  /* ---------- Inisialisasi (harus dari gesture pengguna) ---------- */
  aktifkan() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.musik = this.ctx.createGain();
    this.musik.gain.value = 0.16;   // musik latar selalu pelan
    this.musik.connect(this.master);
    // Buffer bisu: membuka jalur audio di iOS
    const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.master);
    s.start(0);
    return this.ctx;
  }

  get siap() { return !!this.ctx && !this.bisu; }

  setBisu(v) {
    this.bisu = !!v;
    if (this.master) this.master.gain.value = this.bisu ? 0 : 0.9;
    if (this.bisu) this.hentikanBicara();
  }

  setMusik(v) {
    this.musikNyala = !!v;
    if (this.musikNyala) this._mulaiMusik(); else this._hentikanMusik();
  }

  /* ---------- Utilitas ---------- */
  _t() { return this.ctx.currentTime; }

  _env(node, mulai, puncak, panjang, awal = 0.004) {
    const g = node.gain;
    g.setValueAtTime(0.0001, mulai);
    g.exponentialRampToValueAtTime(puncak, mulai + awal);
    g.exponentialRampToValueAtTime(0.0001, mulai + panjang);
  }

  _osc(tipe, freq, panjang, volume = 0.3, tujuan = null) {
    if (!this.siap) return null;
    const t = this._t();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = tipe;
    o.frequency.setValueAtTime(freq, t);
    this._env(g, t, volume, panjang);
    o.connect(g).connect(tujuan || this.sfx);
    o.start(t);
    o.stop(t + panjang + 0.05);
    return { o, g, t };
  }

  _noiseBuffer(detik) {
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * detik));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i += 1) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ---------- Efek ---------- */
  /** Tembakan: white noise 40ms + lowpass sweep 2000→200Hz. */
  tembak() {
    if (!this.siap) return;
    const t = this._t();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.045);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.04);
    const g = this.ctx.createGain();
    this._env(g, t, 0.55, 0.05, 0.002);
    src.connect(lp).connect(g).connect(this.sfx);
    src.start(t);
    // sedikit badan rendah supaya terasa berbobot
    const low = this._osc('triangle', 130, 0.09, 0.28);
    if (low) low.o.frequency.exponentialRampToValueAtTime(70, low.t + 0.09);
  }

  /** Pop benar: nada naik satu tangga tiap combo. */
  pop() {
    if (!this.siap) { this.combo += 1; return; }
    const f = NADA_POP[this.combo % NADA_POP.length];
    this.combo += 1;
    const t = this._t();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.75, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.006); // envelope tajam
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.17);
    // letusan karet balon
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.03);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g2 = this.ctx.createGain();
    this._env(g2, t, 0.22, 0.035, 0.002);
    src.connect(hp).connect(g2).connect(this.sfx);
    src.start(t);
  }

  resetCombo() { this.combo = 0; }

  /** Boing salah: 200→120Hz dalam 180ms, sedikit vibrato. Bukan buzzer. */
  boing() {
    if (!this.siap) return;
    const t = this._t();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 18;
    lfoG.gain.value = 14;
    lfo.connect(lfoG).connect(o.frequency);
    this._env(g, t, 0.34, 0.2, 0.006);
    o.connect(g).connect(this.sfx);
    o.start(t); lfo.start(t);
    o.stop(t + 0.24); lfo.stop(t + 0.24);
  }

  /** Selongsong jatuh: triangle 1800Hz, 60ms, decay cepat. */
  selongsong() { this._osc('triangle', 1800, 0.06, 0.16); }

  /** Reload klik: square 400Hz 30ms, dua kali jeda 120ms. */
  klikReload() {
    this._osc('square', 400, 0.03, 0.2);
    setTimeout(() => this._osc('square', 400, 0.03, 0.2), 120);
  }

  /** Charge: sawtooth naik 200→800Hz selama 1 detik (atau sisa waktu charge). */
  charge(detik = 1) {
    if (!this.siap) return null;
    const t = this._t();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200 + (1 - detik) * 600, t);
    o.frequency.linearRampToValueAtTime(800, t + Math.max(0.05, detik));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.15);
    o.connect(g).connect(this.sfx);
    o.start(t);
    const stop = () => {
      const n = this._t();
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + 0.08);
      o.stop(n + 0.12);
    };
    return { stop };
  }

  /** Bintang: arpeggio C-E-G-C, tiap nada 100ms. */
  bintang() {
    if (!this.siap) return;
    NADA_BINTANG.forEach((f, i) => {
      setTimeout(() => this._osc('triangle', f, 0.16, 0.3), i * 100);
    });
  }

  /** Balon bos pecah / perayaan. */
  fanfare() {
    if (!this.siap) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      setTimeout(() => this._osc('square', f, 0.14, 0.2), i * 90);
    });
  }

  /* ---------- Musik latar (loop pendek nuansa pasar malam) ---------- */
  _mulaiMusik() {
    if (!this.ctx || this._musikTimer) return;
    const pola = [0, 4, 7, 4, 9, 7, 4, 2];  // nada relatif, ceria
    const dasar = 261.63; // C4
    const jeda = 0.28;
    let bar = 0;
    const putar = () => {
      if (!this.musikNyala || !this.ctx) return;
      const t0 = this._t() + 0.05;
      pola.forEach((n, i) => {
        const f = dasar * Math.pow(2, n / 12) * (bar % 2 ? 1 : 0.5);
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = bar % 2 ? 'triangle' : 'square';
        o.frequency.value = f;
        const t = t0 + i * jeda;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + jeda * 0.9);
        o.connect(g).connect(this.musik);
        o.start(t);
        o.stop(t + jeda);
      });
      bar += 1;
    };
    putar();
    this._musikTimer = setInterval(putar, pola.length * jeda * 1000);
  }

  _hentikanMusik() {
    if (this._musikTimer) { clearInterval(this._musikTimer); this._musikTimer = null; }
  }

  /* ---------- Suara huruf & narasi ---------- */
  _pantauSuara() {
    if (!('speechSynthesis' in window)) return;
    const cek = () => {
      const daftar = window.speechSynthesis.getVoices() || [];
      const id = daftar.find((v) => /^id([-_]|$)/i.test(v.lang || ''));
      this.suaraID = id || null;
      this.ttsSiap = !!id;   // tanpa suara id-ID: matikan TTS, jangan jatuh ke Inggris
    };
    cek();
    window.speechSynthesis.addEventListener?.('voiceschanged', cek);
    setTimeout(cek, 400);
    setTimeout(cek, 1500);
  }

  hentikanBicara() {
    this._antrean.length = 0;
    this._sedangBicara = false;
    if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (e) { /* abaikan */ } }
    if (this._sumberRekaman) { try { this._sumberRekaman.stop(); } catch (e) { /* abaikan */ } this._sumberRekaman = null; }
  }

  /** Antrekan ucapan. Jangan tumpuk: feedback dan perintah bergiliran. */
  _antre(tugas) {
    this._antrean.push(tugas);
    if (!this._sedangBicara) this._jalanAntrean();
  }

  _jalanAntrean() {
    const tugas = this._antrean.shift();
    if (!tugas) { this._sedangBicara = false; return; }
    this._sedangBicara = true;
    Promise.resolve()
      .then(tugas)
      .catch(() => {})
      .then(() => this._jalanAntrean());
  }

  /** Ucapkan kalimat bahasa Indonesia (narasi). */
  katakan(teks, { prioritas = false } = {}) {
    if (this.bisu || !this.ttsSiap || !teks) return;
    if (prioritas) this.hentikanBicara();
    this._antre(() => new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(teks);
      u.lang = 'id-ID';
      u.rate = 0.85;
      u.pitch = 1.1;
      if (this.suaraID) u.voice = this.suaraID;
      let selesai = false;
      const habis = () => { if (!selesai) { selesai = true; resolve(); } };
      u.onend = habis;
      u.onerror = habis;
      setTimeout(habis, 4000); // jaring pengaman kalau onend tidak datang
      try { window.speechSynthesis.speak(u); } catch (e) { habis(); }
    }));
  }

  /** Sebut satu huruf: rekaman orang tua dulu, baru TTS ejaan nama. */
  katakanHuruf(besar, ejaanNama, { prioritas = false } = {}) {
    if (this.bisu) return;
    const kunci = `${this.modeSuara}:${String(besar).toUpperCase()}`;
    if (prioritas) this.hentikanBicara();
    this._antre(async () => {
      const buf = await this._rekamanBuffer(kunci);
      if (buf) return this._putarBuffer(buf);
      if (!this.ttsSiap) return null;
      // Mode bunyi tanpa rekaman: pakai nama huruf (TTS tidak bisa fonem tunggal)
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(ejaanNama);
        u.lang = 'id-ID';
        u.rate = 0.85;
        u.pitch = 1.1;
        if (this.suaraID) u.voice = this.suaraID;
        let selesai = false;
        const habis = () => { if (!selesai) { selesai = true; resolve(); } };
        u.onend = habis;
        u.onerror = habis;
        setTimeout(habis, 3000);
        try { window.speechSynthesis.speak(u); } catch (e) { habis(); }
      });
    });
  }

  async _rekamanBuffer(kunci) {
    if (this._bufferRekaman.has(kunci)) return this._bufferRekaman.get(kunci);
    if (!this.ctx) return null;
    try {
      const rec = await dbBaca(kunci);
      if (!rec || !rec.blob) { this._bufferRekaman.set(kunci, null); return null; }
      const ab = await rec.blob.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(ab);
      this._bufferRekaman.set(kunci, buf);
      return buf;
    } catch (e) {
      this._bufferRekaman.set(kunci, null);
      return null;
    }
  }

  _putarBuffer(buf) {
    return new Promise((resolve) => {
      if (!this.ctx) { resolve(); return; }
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = 1;
      s.connect(g).connect(this.master);
      this._sumberRekaman = s;
      s.onended = () => { this._sumberRekaman = null; resolve(); };
      s.start();
      setTimeout(resolve, (buf.duration + 0.4) * 1000);
    });
  }

  /* ---------- API rekaman untuk panel orang tua ---------- */
  async simpanRekaman(mode, besar, blob) {
    const kunci = `${mode}:${String(besar).toUpperCase()}`;
    await dbTulis(kunci, { blob, waktu: Date.now() });
    this._bufferRekaman.delete(kunci);
  }

  async hapusRekaman(mode, besar) {
    const kunci = `${mode}:${String(besar).toUpperCase()}`;
    await dbHapus(kunci);
    this._bufferRekaman.delete(kunci);
  }

  async daftarRekaman() {
    try { return await dbKunci(); } catch (e) { return []; }
  }

  async putarRekaman(mode, besar) {
    const buf = await this._rekamanBuffer(`${mode}:${String(besar).toUpperCase()}`);
    if (buf) this._putarBuffer(buf);
    return !!buf;
  }
}

export const audio = new AudioKios();
export { NADA_POP };
