/* ============================================================
   modes/latihan.js — mode bawaan
   Santai: tanpa timer, tanpa bot, 5 balon, 5 perintah,
   semua bantuan aktif.
   ============================================================ */

import { MesinRonde } from '../round.js';

export const info = {
  id: 'latihan',
  nama: 'Latihan',
  emoji: '🎯',
  ket: 'santai, 5 balon',
  syarat: '',
};

const PERINTAH_PER_RONDE = 5;

export async function jalankan(ctx) {
  const mesin = new MesinRonde(ctx);
  const t0 = performance.now();
  const hasil = [];
  ctx.weapon.setPelurMaks(3);
  let hindari = null;

  for (let i = 0; i < PERINTAH_PER_RONDE; i += 1) {
    if (ctx.batal && ctx.batal()) break;
    const r = await mesin.perintah({
      jumlahBalon: 5,
      bantuan: true,
      bolehCharge: true,
      slowmo: i === PERINTAH_PER_RONDE - 1,   // tembakan terakhir: slow motion
      hindari,
    });
    hasil.push(r);
    hindari = r.target;
  }

  return {
    mode: 'Latihan',
    bintang: MesinRonde.bintang(hasil),
    hasil,
    durasiDetik: (performance.now() - t0) / 1000,
  };
}
