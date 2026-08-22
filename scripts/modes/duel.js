/* ============================================================
   modes/duel.js — rebutan menembak dengan beruang
   Beruang harus terlihat ramah dan sportif: bertepuk tangan saat
   anak menang, tidak mengejek saat anak kalah.
   Bot disetel supaya anak menang ~70%.
   ============================================================ */

import { MesinRonde } from '../round.js';
import { tunggu } from '../weapon.js';

export const info = {
  id: 'duel',
  nama: 'Duel',
  emoji: '🐻',
  ket: 'lomba sama beruang',
  syarat: '',
};

const REAKSI_MIN = 2800;    // ms
const REAKSI_MAKS = 4500;   // ms
const PELUANG_SALAH = 0.30;
const DIAM_SETELAH_SALAH = 2000;
const POIN_MENANG = 3;
const MAKS_PERINTAH = 8;

function rnd(a, b) { return a + Math.random() * (b - a); }

class Beruang {
  constructor(el) {
    this.el = el;
    this.balon = el ? el.querySelector('.beruang-balon') : null;
  }

  tampil(on) { if (this.el) this.el.style.display = on ? '' : 'none'; }

  kata(teks, ms = 1800) {
    if (!this.balon) return;
    this.balon.textContent = teks;
    this.balon.classList.add('tampil');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.balon.classList.remove('tampil'), ms);
  }

  aksi(kelas, ms = 600) {
    if (!this.el) return;
    this.el.classList.add(kelas);
    setTimeout(() => this.el.classList.remove(kelas), ms);
  }
}

export async function jalankan(ctx) {
  const mesin = new MesinRonde(ctx);
  const beruang = new Beruang(document.getElementById('beruang'));
  beruang.tampil(true);
  ctx.weapon.setPelurMaks(3);

  const t0 = performance.now();
  const hasil = [];
  let poinAnak = 0;
  let poinBot = 0;
  let hindari = null;

  const papan = () => ctx.ui.perintahExtra(
    `<span aria-label="skor">🙂 ${poinAnak} — ${poinBot} 🐻</span>`,
  );

  for (let i = 0; i < MAKS_PERINTAH; i += 1) {
    if (poinAnak >= POIN_MENANG || poinBot >= POIN_MENANG) break;
    if (ctx.batal && ctx.batal()) break;

    let timerBot = null;
    const r = await mesin.perintah({
      jumlahBalon: 5,
      bantuan: true,
      hindari,
      slowmo: poinAnak === POIN_MENANG - 1,
      onMulai: () => papan(),
      pengendali: (ctrl) => {
        const cobaBot = () => {
          timerBot = setTimeout(async () => {
            if (ctrl.sudahSelesai()) return;
            if (Math.random() < PELUANG_SALAH) {
              beruang.aksi('meleset', 600);
              beruang.kata('Aduh, meleset!');
              ctx.audio.boing();
              await tunggu(DIAM_SETELAH_SALAH);       // beruang diam 2 detik
              if (!ctrl.sudahSelesai()) cobaBot();
              return;
            }
            beruang.aksi('nembak', 400);
            ctx.audio.tembak();
            await ctrl.selesaiOlehBot();
            poinBot += 1;
            beruang.kata('Dapat!');
          }, rnd(REAKSI_MIN, REAKSI_MAKS));
        };
        cobaBot();
      },
    });
    clearTimeout(timerBot);
    hasil.push(r);
    hindari = r.target;
    if (r.benar) { poinAnak += 1; beruang.kata('Wah, cepat!'); }
    await tunggu(240);
  }

  const menang = poinAnak > poinBot;
  if (menang) {
    beruang.aksi('tepuk', 1400);
    beruang.kata('Kamu hebat!', 2600);
    ctx.progress.catatDuelMenang();
    ctx.audio.fanfare();
  } else {
    beruang.kata('Wah, hebat! Main lagi yuk?', 2800);
  }
  beruang.tampil(false);

  return {
    mode: 'Duel',
    bintang: MesinRonde.bintang(hasil),
    hasil,
    durasiDetik: (performance.now() - t0) / 1000,
    menang,
    pesan: menang ? 'Kamu menang duel! 🐻👏' : 'Beruang menang kali ini. Main lagi yuk!',
  };
}
