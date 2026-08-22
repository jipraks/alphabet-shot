/* ============================================================
   main.js — bootstrap + state machine
   Satu variabel state, satu fungsi transisi. Jangan sebar
   logika transisi ke banyak berkas.

   JUDUL ─┬→ PILIH_MODE → BERMAIN → HASIL_RONDE ─┬→ BERMAIN
          │                  ↑                   ├→ RAK_HADIAH
          │                  └── (jeda) ─────────┘
          │                                      └→ ISTIRAHAT → JUDUL
          └→ PANEL_ORTU
   ============================================================ */

import { ui } from './ui.js';
import { audio } from './audio.js';
import { progress } from './progress.js';
import { stats } from './stats.js';
import { Weapon, Pool, tunggu } from './weapon.js';
import { BalloonField } from './balloons.js';
import { panelOrtu } from './parent.js';
import { ALFABET } from './letters.js';

import * as latihan from './modes/latihan.js';
import * as duel from './modes/duel.js';
import * as serbuan from './modes/serbuan.js';
import * as bos from './modes/bos.js';
import * as duo from './modes/duo.js';

const MODE = { latihan, duel, serbuan, bos, duo };
const URUT_MODE = ['latihan', 'duel', 'serbuan', 'bos', 'duo'];
const RONDE_SEBELUM_ISTIRAHAT = 3;

let state = 'JUDUL';
let ctx = null;
let modeTerakhir = 'latihan';
let sedangMain = false;
let batal = false;
let rakSudahPenuh = progress.rakLengkap();

/* ---------- State machine ---------- */
function setState(baru) {
  state = baru;
  const layar = {
    JUDUL: 'judul',
    PILIH_MODE: 'mode',
    BERMAIN: 'bermain',
    HASIL_RONDE: 'hasil',
    RAK_HADIAH: 'rak',
    ISTIRAHAT: 'istirahat',
    PANEL_ORTU: 'ortu',
  }[baru];
  ui.tampilkan(layar);
  document.body.dataset.state = baru;
  if (baru !== 'BERMAIN') {
    ui.perintahSembunyi();
    ctx?.field.bersihkan();
    ctx?.field.hentikan();      // jangan biarkan loop rAF jalan di layar menu
  }
}

/* ---------- Kurangi gerak ---------- */
function terapkanGerak() {
  const sistem = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paksa = progress.setelan.reduced_motion;
  const kurangi = paksa === true || (paksa == null && sistem);
  document.body.classList.toggle('kurangi-gerak', kurangi);
  document.body.classList.toggle('tanpa-getar', !progress.setelan.getar);
}

/* ---------- Ronde ---------- */
async function mulaiRonde(modeId) {
  if (sedangMain) return;
  const mod = MODE[modeId];
  if (!mod) return;
  if (!progress.modeTerbuka(modeId)) { ui.toast('Mode ini masih terkunci'); return; }
  modeTerakhir = modeId;
  sedangMain = true;
  batal = false;
  setState('BERMAIN');

  const sebelum = {};
  ALFABET.forEach((h) => { sebelum[h] = progress.tingkat(h); });

  let hasil;
  try {
    hasil = await mod.jalankan(ctx);
  } catch (e) {
    console.error('Ronde gagal:', e);
    hasil = { mode: modeId, bintang: 1, hasil: [], durasiDetik: 0 };
  }
  sedangMain = false;
  ctx.field.bersihkan();
  ui.perintahSembunyi();
  ctx.weapon.setPelurMaks(3);

  // Progres, sesi, skin
  const langkah = progress.selesaiRonde({ bintang: hasil.bintang });
  stats.catatRonde({ durasiDetik: hasil.durasiDetik });
  const skinBaru = progress.cekSkin();
  ui.rakRender();

  const hurufBaru = ALFABET.filter((h) => sebelum[h] === 'belum' && progress.tingkat(h) !== 'belum');
  const naikHafal = ALFABET.filter((h) => sebelum[h] !== 'hafal' && progress.tingkat(h) === 'hafal');

  ui.hasilRender({
    bintang: hasil.bintang,
    hurufBaru,
    mode: hasil.mode || modeId,
    pesan: hasil.pesan || '',
    naikTingkat: naikHafal,
  });
  setState('HASIL_RONDE');
  audio.bintang();
  if (langkah.naik) ui.toast('Huruf baru terbuka! 🎈');
  skinBaru.forEach((s, i) => setTimeout(() => ui.toast(`Skin baru: ${s.emoji} ${s.nama}!`), 900 + i * 2200));

  // Perayaan rak penuh (sekali saja saat pertama lengkap)
  if (!rakSudahPenuh && progress.rakLengkap()) {
    rakSudahPenuh = true;
    await tunggu(1400);
    bukaRak(true);
  }
}

function bukaRak(perayaan = false) {
  ui.rakPenuhRender();
  ui.skinRender((id) => ctx?.weapon.setSkin(id));
  setState('RAK_HADIAH');
  if (perayaan) {
    audio.fanfare();
    hujanConfetti();
    ui.toast('Rak hadiah penuh! Hebat sekali! 🏆');
  }
}

/* ---------- Confetti sepenuh layar ---------- */
let poolPerayaan = null;
function hujanConfetti() {
  const lapis = document.getElementById('fx-top');
  if (!lapis) return;
  if (!poolPerayaan) poolPerayaan = new Pool(lapis, 'confetti', 60);
  const warna = ['var(--balon-1)', 'var(--balon-2)', 'var(--balon-3)', 'var(--balon-4)', 'var(--balon-5)', 'var(--lampu)'];
  const W = window.innerWidth;
  const H = window.innerHeight;
  for (let i = 0; i < 60; i += 1) {
    const el = poolPerayaan.ambil();
    el.style.setProperty('--warna', warna[i % warna.length]);
    const x = Math.random() * W;
    el.animate([
      { transform: `translate(${x}px, -20px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x + (Math.random() * 120 - 60)}px, ${H + 40}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0.9 },
    ], { duration: 1800 + Math.random() * 1200, delay: Math.random() * 900, easing: 'ease-in', fill: 'none' });
  }
}

/* ---------- Tombol ---------- */
function pasangTombol() {
  document.getElementById('btn-mulai')?.addEventListener('click', () => {
    // Gesture pertama: buka jalur audio (kebijakan autoplay browser)
    audio.aktifkan();
    audio.setBisu(progress.setelan.bisu);
    audio.modeSuara = progress.setelan.mode_suara;
    audio.setMusik(progress.setelan.musik);
    setState('PILIH_MODE');
  });

  document.getElementById('btn-rak-judul')?.addEventListener('click', () => bukaRak());
  document.getElementById('btn-rak-hasil')?.addEventListener('click', () => bukaRak());
  document.querySelectorAll('[data-aksi="judul"]').forEach((b) => {
    b.addEventListener('click', () => { stats.resetRondeBerturut(); setState('JUDUL'); });
  });
  document.querySelectorAll('[data-aksi="pilih-mode"]').forEach((b) => {
    b.addEventListener('click', () => setState('PILIH_MODE'));
  });

  document.getElementById('btn-main-lagi')?.addEventListener('click', () => {
    if (progress.setelan.pengingat_istirahat && stats.rondeBerturut >= RONDE_SEBELUM_ISTIRAHAT) {
      setState('ISTIRAHAT');
      return;
    }
    mulaiRonde(modeTerakhir);
  });

  document.getElementById('btn-istirahat-cukup')?.addEventListener('click', () => {
    stats.resetRondeBerturut();
    setState('JUDUL');
  });
  document.getElementById('btn-istirahat-lagi')?.addEventListener('click', () => {
    stats.resetRondeBerturut();
    mulaiRonde(modeTerakhir);
  });

  // Toggle di meja: bisu & musik
  const btnBisu = document.getElementById('btn-bisu');
  const btnMusik = document.getElementById('btn-musik');
  const segarToggle = () => {
    btnBisu?.setAttribute('aria-pressed', String(progress.setelan.bisu));
    if (btnBisu) btnBisu.textContent = progress.setelan.bisu ? '🔇' : '🔊';
    btnMusik?.setAttribute('aria-pressed', String(progress.setelan.musik));
    if (btnMusik) btnMusik.textContent = progress.setelan.musik ? '🎵' : '🎶';
  };
  btnBisu?.addEventListener('click', () => {
    progress.setSetelan('bisu', !progress.setelan.bisu);
    audio.setBisu(progress.setelan.bisu);
    segarToggle();
  });
  btnMusik?.addEventListener('click', () => {
    progress.setSetelan('musik', !progress.setelan.musik);
    audio.aktifkan();
    audio.setMusik(progress.setelan.musik);
    segarToggle();
  });
  segarToggle();

  document.getElementById('btn-ortu-keluar')?.addEventListener('click', () => setState('JUDUL'));
}

/* ---------- Bootstrap ---------- */
async function init() {
  ui.init();
  terapkanGerak();
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', terapkanGerak);
  document.addEventListener('th:gerak', terapkanGerak);

  const app = document.getElementById('app');
  const arena = document.getElementById('arena');
  const kios = document.getElementById('kios');
  const kiosFlash = document.getElementById('kios-flash');
  const fx = document.getElementById('fx');
  const fxTop = document.getElementById('fx-top');

  const opsiWeapon = { app, fx, fxTop, kios, kiosFlash, audio };
  const weapon = new Weapon({ ...opsiWeapon, el: document.getElementById('weapon'), ammoEl: document.getElementById('ammo') });
  await weapon.setSkin(progress.data.skin_aktif);
  weapon.setPelurMaks(3);

  const field = new BalloonField({ arena, fx, fxTop, audio });

  ctx = {
    app, arena, kios, weapon, field, ui, audio, progress, stats,
    buatWeapon: (el) => new Weapon({ ...opsiWeapon, el, ammoEl: null }),
    batal: () => batal,
  };

  audio.modeSuara = progress.setelan.mode_suara;
  ui.modeRender(URUT_MODE.map((id) => MODE[id].info), (id) => mulaiRonde(id));
  ui.skinRender((id) => weapon.setSkin(id));
  panelOrtu.init({ onKeluar: () => setState('JUDUL') });
  pasangTombol();

  progress.dengar((e) => {
    if (e.jenis === 'skin') weapon.setSkin(progress.data.skin_aktif);
    if (e.jenis === 'reset') { ui.rakRender(); rakSudahPenuh = false; }
    if (e.jenis === 'setelan' && e.kunci === 'mode_suara') audio.modeSuara = e.nilai;
    ui.modeRender(URUT_MODE.map((id) => MODE[id].info), (id) => mulaiRonde(id));
  });

  setState('JUDUL');

  // Service worker: path relatif supaya tetap jalan di sub-folder GitHub Pages
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* offline nanti */ });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
