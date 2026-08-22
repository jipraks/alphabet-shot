/* ============================================================
   modes/bos.js — Bos Huruf Plin-plan
   Satu balon besar yang hurufnya berganti tiap 1,5 detik:
   b → d → p → q → ulang. Tembak tepat saat huruf yang benar
   sedang tampil. Tiga kali benar = bos pecah.

   Penilaian memakai huruf yang TAMPIL SAAT ANAK MENEKAN, bukan
   saat peluru mendarat — anak 4–6 tidak boleh dihukum karena
   peluru butuh 250ms terbang.
   ============================================================ */

import { MesinRonde } from '../round.js';
import { ejaan } from '../letters.js';
import { tunggu } from '../weapon.js';

export const info = {
  id: 'bos',
  nama: 'Bos Plin-plan',
  emoji: '👑',
  ket: 'b d p q berganti',
  syarat: 'buka di Paket 4',
};

const SIKLUS = ['b', 'd', 'p', 'q'];
const GANTI = 1500;          // ms
const GANTI_LAMBAT = 2200;   // bantuan diam-diam
const BUTUH = 3;

function acakDari(arr, kecuali) {
  const p = arr.filter((x) => x !== kecuali);
  return p[Math.floor(Math.random() * p.length)];
}

export async function jalankan(ctx) {
  const { weapon, field, ui, audio, stats, arena } = ctx;
  const mesin = new MesinRonde(ctx);
  weapon.setPelurMaks(3, { tanpaBatas: true });

  let target = acakDari(SIKLUS, null);
  let idx = Math.floor(Math.random() * SIKLUS.length);
  let benarHit = 0;
  let salahHit = 0;
  let selesai = false;
  let jeda = GANTI;
  const t0 = performance.now();

  ui.perintahTampil(target.toUpperCase(), 'Tembak pas hurufnya cocok!');
  field.ukurUlang();
  const [bos] = field.spawn([{ huruf: SIKLUS[idx], benar: SIKLUS[idx] === target, bos: true }]);
  audio.katakanHuruf(target, `Tembak pas muncul ${ejaan(target)}!`, { prioritas: true });
  let papan = ui.perintahExtra('👑 0 / 3');

  const putar = () => {
    if (selesai) return;
    idx = (idx + 1) % SIKLUS.length;
    field.setHuruf(bos, SIKLUS[idx], SIKLUS[idx] === target);
    timer = setTimeout(putar, jeda);
  };
  let timer = setTimeout(putar, jeda);

  let bantuan1 = null;
  let bantuan2 = null;
  const pasangBantuan = () => {
    clearTimeout(bantuan1);
    clearTimeout(bantuan2);
    bantuan1 = setTimeout(() => { jeda = GANTI_LAMBAT; }, 12000);
    bantuan2 = setTimeout(async () => {
      // Selalu berhasil pada akhirnya: laras menembak sendiri pada saat yang tepat
      if (selesai) return;
      if (bos.huruf !== target) { bantuan2 = setTimeout(() => pasangBantuan(), 300); return; }
      audio.katakan(`Ini dia, ${ejaan(target)}!`, { prioritas: true });
      await tembakBos(true);
    }, 20000);
  };
  pasangBantuan();

  const tembakBos = async (otomatis = false) => {
    if (selesai || !weapon.bisaTembak()) return;
    const hurufSaatTekan = bos.huruf;         // dinilai saat menekan
    const app = ctx.app.getBoundingClientRect();
    const p = field.pusatApp(bos, app);
    const jadi = await weapon.tembak(p.x, p.y);
    if (!jadi || selesai) return;
    if (hurufSaatTekan === target) {
      benarHit += 1;
      jeda = GANTI;
      if (papan) papan.innerHTML = `👑 ${benarHit} / ${BUTUH}`;
      stats.catat(target.toUpperCase(), { benar: true, firstTry: !otomatis && salahHit === 0, ms: 1200, otomatis });
      audio.pop();
      bos.el.animate(
        [{ filter: 'brightness(2.4)' }, { filter: 'brightness(1)' }],
        { duration: 260, easing: 'ease-out' },
      );
      ui.kedipSlot(target.toUpperCase());
      ui.segarSlot(target.toUpperCase());
      if (benarHit >= BUTUH) {
        selesai = true;
        clearTimeout(timer);
        clearTimeout(bantuan1);
        clearTimeout(bantuan2);
        audio.fanfare();
        await field.pecahkan(bos, { slotEl: ui.slotEl(target.toUpperCase()), slowmo: true });
        return;
      }
      // huruf target baru, bos terus berputar
      target = acakDari(SIKLUS, target);
      ui.perintahTampil(target.toUpperCase(), 'Tembak pas hurufnya cocok!');
      papan = ui.perintahExtra(`👑 ${benarHit} / ${BUTUH}`);
      audio.katakanHuruf(target, `Sekarang ${ejaan(target)}!`, { prioritas: true });
      field.setHuruf(bos, bos.huruf, bos.huruf === target);
      pasangBantuan();
    } else {
      salahHit += 1;
      field.pantul(bos);
      stats.catat(target.toUpperCase(), { benar: false });
    }
  };

  const lepas = mesin.pasangInput(arena, (ax, ay) => {
    const kena = field.cari(ax, ay);
    if (kena === bos) tembakBos(false);
    else if (!kena) tembakBos(false);   // tap di sekitar bos besar: tetap menembak
  }, { bolehCharge: false });

  while (!selesai) await tunggu(120);
  lepas();
  clearTimeout(timer);
  clearTimeout(bantuan1);
  clearTimeout(bantuan2);
  await tunggu(200);

  let bintang = 1;
  if (salahHit === 0) bintang = 3;
  else if (salahHit <= 2) bintang = 2;

  return {
    mode: 'Bos Plin-plan',
    bintang,
    hasil: [],
    durasiDetik: (performance.now() - t0) / 1000,
    pesan: 'Bos pecah jadi hujan confetti! 👑',
  };
}
