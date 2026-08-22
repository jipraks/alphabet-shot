/* ============================================================
   ui.js — transisi layar, rak hadiah, layar bintang, toast
   Tidak ada jalur UI yang mewajibkan membaca: setiap tombol
   punya emoji/ikon dan (kalau perlu) narasi suara.
   ============================================================ */

import { ALFABET, warnaHuruf } from './letters.js';
import { progress, SKIN } from './progress.js';

const LAYAR = ['judul', 'mode', 'bermain', 'hasil', 'rak', 'istirahat', 'ortu'];

class UI {
  constructor() {
    this.el = {};
    this.layarAktif = 'judul';
    this._toastTimer = 0;
  }

  init() {
    this.el.app = document.getElementById('app');
    this.el.kios = document.getElementById('kios');
    this.el.shelf = document.getElementById('shelf');
    this.el.perintah = document.getElementById('perintah');
    this.el.toast = document.getElementById('toast');
    this.el.rakPenuh = document.getElementById('rak-penuh');
    LAYAR.forEach((n) => { this.el[`layar-${n}`] = document.getElementById(`layar-${n}`); });
    this.rakRender();
  }

  /* ---------- Layar ---------- */
  tampilkan(nama) {
    LAYAR.forEach((n) => {
      const el = this.el[`layar-${n}`];
      if (el) el.classList.toggle('tampil', n === nama);
    });
    this.layarAktif = nama;
    document.body.dataset.layar = nama;
  }

  /* ---------- Rak hadiah ---------- */
  rakRender() {
    if (this.el.shelf && !this.el.shelf.children.length) {
      ALFABET.forEach((h) => {
        const d = document.createElement('div');
        d.className = 'shelf-slot';
        d.dataset.huruf = h;
        this.el.shelf.appendChild(d);
      });
    }
    ALFABET.forEach((h) => {
      const t = progress.tingkat(h);
      const slot = this.slotEl(h);
      if (slot) {
        slot.dataset.tingkat = t;
        slot.style.setProperty('--doll', warnaHuruf(h));
        // siluet untuk yang belum terkumpul: huruf tetap terlihat samar
        slot.textContent = t === 'belum' ? h.toLowerCase() : h.toLowerCase();
        slot.setAttribute('aria-label', `${h} ${t}`);
      }
    });
    this.rakPenuhRender();
  }

  /** Segarkan satu slot (dipanggil begitu huruf mendarat di rak). */
  segarSlot(huruf) {
    const h = String(huruf).toUpperCase();
    const slot = this.slotEl(h);
    if (!slot) return;
    const t = progress.tingkat(h);
    slot.dataset.tingkat = t;
    slot.style.setProperty('--doll', warnaHuruf(h));
    slot.setAttribute('aria-label', `${h} ${t}`);
  }

  slotEl(huruf) {
    return this.el.shelf ? this.el.shelf.querySelector(`.shelf-slot[data-huruf="${huruf}"]`) : null;
  }

  kedipSlot(huruf) {
    const slot = this.slotEl(huruf);
    if (!slot) return;
    slot.classList.remove('isi');
    void slot.offsetWidth;
    slot.classList.add('isi');
    // pastikan slot terlihat di strip yang bisa digeser
    if (this.el.shelf && this.el.shelf.scrollWidth > this.el.shelf.clientWidth) {
      slot.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    setTimeout(() => slot.classList.remove('isi'), 560);
  }

  rakPenuhRender() {
    const wadah = this.el.rakPenuh;
    if (!wadah) return;
    const label = { belum: '', kenal: 'kenal', hafal: 'hafal' };
    wadah.innerHTML = '';
    ALFABET.forEach((h) => {
      const t = progress.tingkat(h);
      const item = document.createElement('div');
      item.className = 'rak-item';
      item.dataset.tingkat = t;
      item.style.setProperty('--warna', warnaHuruf(h));
      item.innerHTML = `<span class="boneka">${h}${h.toLowerCase()}</span><span class="cap">${label[t]}</span>`;
      wadah.appendChild(item);
    });
    const lengkap = progress.rakLengkap();
    wadah.classList.toggle('rak-lengkap', lengkap);
    const info = document.getElementById('rak-info');
    if (info) {
      const kenal = progress.jumlahTingkat('kenal', true);
      const hafal = progress.jumlahTingkat('hafal');
      info.textContent = lengkap
        ? `Rak penuh! ${hafal} huruf sudah dihafal.`
        : `${kenal} dari 26 boneka huruf terkumpul · ${hafal} dihafal`;
    }
  }

  /* ---------- Perintah ---------- */
  perintahTampil(huruf, label = 'Tembak huruf kecilnya!') {
    const p = this.el.perintah;
    if (!p) return;
    p.innerHTML = `<div class="kartu masuk">${huruf}</div><div class="label">${label}</div>`;
  }

  perintahExtra(html) {
    const p = this.el.perintah;
    if (!p) return;
    const d = document.createElement('div');
    d.className = 'timer-serbuan';
    d.innerHTML = html;
    p.appendChild(d);
    return d;
  }

  perintahSembunyi() {
    if (this.el.perintah) this.el.perintah.innerHTML = '';
  }

  /* ---------- Kamera (tembakan terakhir ronde) ---------- */
  zoomKamera(on) {
    if (!this.el.app) return;
    if (document.body.classList.contains('kurangi-gerak')) return;
    this.el.app.style.transition = 'transform 320ms ease-out';
    this.el.app.style.transformOrigin = '50% 60%';
    this.el.app.style.transform = on ? 'scale(1.08)' : 'scale(1)';
    if (!on) setTimeout(() => { this.el.app.style.transition = ''; }, 340);
  }

  /* ---------- Layar bintang ---------- */
  hasilRender({ bintang = 1, hurufBaru = [], mode = 'latihan', pesan = '', naikTingkat = [] }) {
    const wadah = document.getElementById('hasil-bintang');
    if (wadah) {
      wadah.innerHTML = '';
      for (let i = 0; i < 3; i += 1) {
        const s = document.createElement('div');
        s.className = 'bintang' + (i < bintang ? ' isi' : '');
        s.textContent = '★';
        wadah.appendChild(s);
        setTimeout(() => s.classList.add('muncul'), 180 + i * 260);
      }
    }
    const hb = document.getElementById('hasil-huruf');
    if (hb) {
      hb.innerHTML = '';
      const daftar = hurufBaru.length ? hurufBaru : [];
      daftar.forEach((h) => {
        const c = document.createElement('span');
        c.className = 'huruf-chip';
        c.style.setProperty('--warna', warnaHuruf(h));
        c.textContent = `${h}${h.toLowerCase()}`;
        hb.appendChild(c);
      });
    }
    const judul = document.getElementById('hasil-judul');
    if (judul) {
      judul.textContent = bintang === 3 ? 'Hebat!' : (bintang === 2 ? 'Bagus!' : 'Selesai!');
    }
    const ket = document.getElementById('hasil-pesan');
    if (ket) {
      const naik = naikTingkat.length ? ` ${naikTingkat.join(', ')} sudah dihafal!` : '';
      ket.textContent = pesan || (hurufBaru.length ? `Boneka huruf baru masuk rak!${naik}` : `Semua huruf sudah di rak.${naik}`);
    }
    const catatanMode = document.getElementById('hasil-mode');
    if (catatanMode) catatanMode.textContent = mode;
  }

  /* ---------- Toast ---------- */
  toast(teks, ms = 2600) {
    const t = this.el.toast;
    if (!t) return;
    t.textContent = teks;
    t.classList.add('tampil');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('tampil'), ms);
  }

  /* ---------- Skin ---------- */
  skinRender(onPilih) {
    const wadah = document.getElementById('skin-grid');
    if (!wadah) return;
    wadah.innerHTML = '';
    SKIN.forEach((s) => {
      const terbuka = progress.skinTerbuka(s.id);
      const b = document.createElement('button');
      b.className = 'skin-kartu';
      b.type = 'button';
      b.setAttribute('aria-pressed', String(progress.data.skin_aktif === s.id));
      if (!terbuka) b.setAttribute('aria-disabled', 'true');
      b.innerHTML = `<span style="font-size:26px">${s.emoji}</span>
        <span><b>${s.nama}</b></span>
        <span style="font-size:10px;opacity:.75">${terbuka ? 'siap dipakai' : s.ket}</span>`;
      b.addEventListener('click', () => {
        if (!progress.skinTerbuka(s.id)) {
          this.toast(`Terkunci: ${s.ket}`);
          return;
        }
        progress.pilihSkin(s.id);
        this.skinRender(onPilih);
        if (onPilih) onPilih(s.id);
      });
      wadah.appendChild(b);
    });
  }

  /* ---------- Mode ---------- */
  modeRender(daftar, onPilih) {
    const wadah = document.getElementById('mode-grid');
    if (!wadah) return;
    wadah.innerHTML = '';
    daftar.forEach((m) => {
      const terbuka = progress.modeTerbuka(m.id);
      const b = document.createElement('button');
      b.className = 'mode-kartu';
      b.type = 'button';
      if (!terbuka) b.setAttribute('aria-disabled', 'true');
      b.innerHTML = `<span class="emoji">${m.emoji}</span>
        <span class="nama">${m.nama}</span>
        <span class="ket">${terbuka ? m.ket : m.syarat}</span>
        ${terbuka ? '' : '<span class="kunci">🔒</span>'}`;
      b.addEventListener('click', () => {
        if (!progress.modeTerbuka(m.id)) { this.toast(`Terkunci: ${m.syarat}`); return; }
        onPilih(m.id);
      });
      wadah.appendChild(b);
    });
  }
}

export const ui = new UI();
