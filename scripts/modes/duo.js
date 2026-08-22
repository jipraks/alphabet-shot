/* ============================================================
   modes/duo.js — dua pemain satu layar
   Dua laras (kiri-bawah & kanan-bawah), warna berbeda, multi-touch.
   Rebutan menembak balon yang benar. Cocok untuk kakak-adik.

   Statistik tidak dicatat sebagai jawaban benar: dengan dua anak
   bermain, data per huruf tidak bisa dipercaya milik siapa.
   Huruf tetap masuk rak hadiah.
   ============================================================ */

import { MesinRonde } from '../round.js';
import { tunggu } from '../weapon.js';

export const info = {
  id: 'duo',
  nama: '2 Pemain',
  emoji: '👧🧒',
  ket: 'satu layar, rebutan',
  syarat: '',
};

const POIN_MENANG = 3;
const MAKS_PERINTAH = 6;

export async function jalankan(ctx) {
  const { weapon, field, ui, audio, stats, arena, app } = ctx;
  const mesin = new MesinRonde(ctx);

  // Laras kedua: kloning struktur laras pertama supaya geometri & timing sama
  const el2 = weapon.el.cloneNode(true);
  el2.id = 'weapon2';
  weapon.el.parentNode.appendChild(el2);
  const w2 = ctx.buatWeapon(el2);
  await w2.setSkin(ctx.progress.data.skin_aktif);
  w2.setPelurMaks(3, { tanpaBatas: true });
  el2.classList.add('p2');
  weapon.el.classList.add('p1-duo');
  weapon.setPelurMaks(3, { tanpaBatas: true });
  weapon.jadwalUkur();
  w2.jadwalUkur();

  const t0 = performance.now();
  const skor = [0, 0];
  const hasil = [];
  let hindari = null;

  const papan = () => ui.perintahExtra(`<span>👧 ${skor[0]} — ${skor[1]} 🧒</span>`);

  for (let putaran = 0; putaran < MAKS_PERINTAH; putaran += 1) {
    if (skor[0] >= POIN_MENANG || skor[1] >= POIN_MENANG) break;
    if (ctx.batal && ctx.batal()) break;

    const { target, daftar } = mesin.susunBalon({
      paket: ctx.progress.data.paket,
      tierAktif: ctx.progress.setelan.tier_aktif,
      jumlahBalon: 6,
      hindari,
      sedangSulit: (h) => stats.sulit(h),
    });
    hindari = target;
    ui.perintahTampil(target, 'Siapa cepat?');
    field.ukurUlang();
    field.spawn(daftar);
    papan();
    audio.resetCombo();
    audio.katakanHuruf(target, `Tembak huruf kecilnya. ${target.toLowerCase()}!`, { prioritas: true });

    let selesai = false;
    let pemenang = -1;
    const tengah = () => field.rect.w / 2;

    const tembakPemain = async (p, ax, ay) => {
      const w = p === 0 ? weapon : w2;
      if (selesai || !w.bisaTembak()) return;
      const sasaran = field.cari(ax, ay);
      const ar = app.getBoundingClientRect();
      if (!sasaran) {
        await w.tembak(ax + field.rect.left - ar.left, ay + field.rect.top - ar.top);
        return;
      }
      const pos = field.pusatApp(sasaran, ar);
      const jadi = await w.tembak(pos.x, pos.y);
      if (!jadi || selesai) return;
      if (sasaran.benar) {
        selesai = true;
        pemenang = p;
        skor[p] += 1;
        await field.pecahkan(sasaran, { slotEl: ui.slotEl(target), slowmo: skor[p] >= POIN_MENANG });
        ui.kedipSlot(target);
      } else {
        field.pantul(sasaran);
      }
    };

    const lepas1 = mesin.pasangInput(arena, (ax, ay) => tembakPemain(0, ax, ay), {
      filterPemain: (k) => k.arenaX < tengah(),
    });
    const lepas2 = mesin.pasangInput(arena, (ax, ay) => tembakPemain(1, ax, ay), {
      filterPemain: (k) => k.arenaX >= tengah(),
      papanTombol: false,
    });

    // Bantuan bertingkat tetap ada supaya perintah selalu selesai
    const t1 = setTimeout(() => field.denyut(true), 6000);
    const t2 = setTimeout(() => field.sorot(true), 10000);
    const t3 = setTimeout(async () => {
      if (selesai) return;
      const b = field.benar();
      if (!b) return;
      const ar = app.getBoundingClientRect();
      const pos = field.pusatApp(b, ar);
      audio.katakan('Ini dia!', { prioritas: true });
      await weapon.tembak(pos.x, pos.y, { pakaiPeluru: false });
      if (selesai) return;
      selesai = true;
      await field.pecahkan(b, { slotEl: ui.slotEl(target) });
      ui.kedipSlot(target);
    }, 14000);

    while (!selesai) await tunggu(100);
    [t1, t2, t3].forEach(clearTimeout);
    lepas1();
    lepas2();
    field.bersihBantuan();
    // Huruf masuk rak, tidak dihitung sebagai jawaban benar siapa pun
    stats.catat(target, { otomatis: true });
    ui.segarSlot(target);
    hasil.push({ target, benar: pemenang >= 0, firstTry: false });
    await tunggu(260);
  }

  w2.hancurkan();
  el2.remove();
  weapon.el.classList.remove('p1-duo');
  weapon.setPelurMaks(3);

  const menang = skor[0] === skor[1] ? -1 : (skor[0] > skor[1] ? 0 : 1);
  audio.fanfare();
  return {
    mode: '2 Pemain',
    bintang: 3,                       // mode bersama: tidak menilai satu anak
    hasil: [],
    durasiDetik: (performance.now() - t0) / 1000,
    pesan: menang < 0 ? `Seri! ${skor[0]} — ${skor[1]}` : `Pemain ${menang + 1} menang! ${skor[0]} — ${skor[1]}`,
  };
}
