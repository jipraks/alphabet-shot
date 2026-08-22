/* ============================================================
   modes/serbuan.js — 30 detik, satu huruf besar tetap
   Tembak sebanyak mungkin huruf kecil yang cocok. Balon respawn
   terus. Peluru tidak terbatas, cooldown 250ms tetap berlaku.
   Terbuka setelah anak menyelesaikan Paket 2.
   ============================================================ */

import { MesinRonde } from '../round.js';
import { kolamHuruf, pilihPengecoh, pilihTarget, tierHuruf, ejaan, PAKET_TIER } from '../letters.js';
import { tunggu } from '../weapon.js';

export const info = {
  id: 'serbuan',
  nama: 'Serbuan',
  emoji: '⚡',
  ket: '30 detik, tembak terus',
  syarat: 'selesaikan Paket 2',
};

const DURASI = 30000;
const BALON_MAKS = 6;
const BENAR_LAYAR = 2;

export async function jalankan(ctx) {
  const { weapon, field, ui, audio, stats, progress, arena } = ctx;
  const mesin = new MesinRonde(ctx);
  weapon.setPelurMaks(3, { tanpaBatas: true });

  const paket = progress.data.paket;
  const kolam = kolamHuruf(paket, progress.setelan.tier_aktif);
  const target = pilihTarget(kolam, (h) => stats.sulit(h));
  const tier = (PAKET_TIER[paket] || [1]).includes(4) ? 4 : tierHuruf(target);
  const kecil = target.toLowerCase();

  ui.perintahTampil(target, 'Tembak semua huruf kecilnya!');
  const jam = ui.perintahExtra('⏱ 30');
  audio.katakanHuruf(target, `Tembak semua huruf ${ejaan(target)} kecil!`, { prioritas: true });

  /**
   * Jangan pernah dua balon berhuruf sama (kecuali balon target, yang memang
   * boleh muncul beberapa). `tambahan` = huruf yang sudah masuk daftar tapi
   * balonnya belum dibuat.
   */
  const pengecohBaru = (tambahan = []) => {
    const dipakai = new Set([...field.hidup().map((b) => b.huruf), ...tambahan, kecil]);
    const calon = pilihPengecoh(target, 12, { paket, tier });
    return calon.find((h) => !dipakai.has(h)) || calon[0];
  };
  field.ukurUlang();
  const BALON_LAYAR = Math.max(4, Math.min(BALON_MAKS, field.kapasitas()));
  const awal = [];
  for (let i = 0; i < BALON_LAYAR; i += 1) {
    awal.push(i < BENAR_LAYAR
      ? { huruf: kecil, benar: true }
      : { huruf: pengecohBaru(awal.map((d) => d.huruf)), benar: false });
  }
  field.ukurUlang();          // kartu perintah sudah tampil di atas
  field.spawn(awal);

  let poin = 0;
  let salah = 0;
  let berturut = 0;
  let habis = false;
  const t0 = performance.now();

  const isiUlangBalon = () => {
    const hidup = field.hidup();
    const benar = hidup.filter((b) => b.benar).length;
    // bersihkan balon yang sudah pecah dari DOM secara berkala
    field.balon = field.balon.filter((b) => {
      if (b.hidup) return true;
      b.el.remove();
      return false;
    });
    while (field.hidup().length < BALON_LAYAR) {
      const perluBenar = field.hidup().filter((b) => b.benar).length < BENAR_LAYAR;
      field.tambah(perluBenar
        ? { huruf: kecil, benar: true }
        : { huruf: pengecohBaru(), benar: false });
      if (!perluBenar && benar === 0) break;
    }
  };

  const tembak = async (ax, ay) => {
    if (habis || !weapon.bisaTembak()) return;
    const sasaran = field.cari(ax, ay);
    const app = ctx.app.getBoundingClientRect();
    if (!sasaran) {
      await weapon.tembak(ax + field.rect.left - app.left, ay + field.rect.top - app.top);
      return;
    }
    const p = field.pusatApp(sasaran, app);
    const jadi = await weapon.tembak(p.x, p.y);
    if (!jadi || habis) return;
    if (sasaran.benar) {
      poin += 1;
      berturut += 1;
      stats.catat(target, { benar: true, firstTry: berturut === 1 || salah === 0, ms: 900 });
      await field.pecahkan(sasaran, { slotEl: ui.slotEl(target) });
      ui.kedipSlot(target);
      ui.segarSlot(target);
      isiUlangBalon();
    } else {
      salah += 1;
      berturut = 0;
      field.pantul(sasaran);
      audio.resetCombo();
      stats.catat(target, { benar: false });
    }
  };

  const lepas = mesin.pasangInput(arena, tembak, { bolehCharge: progress.chargeTerbuka() });

  // Hitung mundur
  let sisa = Math.round(DURASI / 1000);
  const tick = setInterval(() => {
    sisa -= 1;
    if (jam) jam.innerHTML = `⏱ ${Math.max(0, sisa)}`;
    if (sisa <= 0) clearInterval(tick);
  }, 1000);

  await tunggu(DURASI);
  habis = true;
  clearInterval(tick);
  lepas();
  audio.bintang();

  const total = poin + salah;
  const akurasi = total ? poin / total : 0;
  let bintang = 1;
  if (poin >= 5 && akurasi >= 0.95) bintang = 3;
  else if (akurasi >= 0.8 && poin >= 3) bintang = 2;

  return {
    mode: 'Serbuan',
    bintang,
    hasil: [],
    poin,
    durasiDetik: (performance.now() - t0) / 1000,
    pesan: `${poin} balon ${target}${kecil} pecah!`,
  };
}
