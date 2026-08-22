/* ============================================================
   parent.js — panel orang tua
   Akses: tahan logo 3 detik, lalu jawab 7 × 8.
   Isi: statistik per huruf, 5 huruf tersulit, grafik 7 sesi,
   pengaturan, rekam suara sendiri, ekspor JSON.
   ============================================================ */

import { progress } from './progress.js';
import { stats } from './stats.js';
import { audio } from './audio.js';
import { ALFABET, ejaan } from './letters.js';
import { ui } from './ui.js';

const TAHAN_MS = 3000;
const JAWABAN = 56;         // 7 x 8
const REKAM_MS = 1600;

function menit(detik) {
  const m = Math.floor(detik / 60);
  const s = Math.round(detik % 60);
  if (m <= 0) return `${s} detik`;
  return `${m} menit${s ? ` ${s} detik` : ''}`;
}

function persen(x) {
  return x == null ? '–' : `${Math.round(x * 100)}%`;
}

class PanelOrtu {
  constructor() {
    this.terbuka = false;
    this.modeKetuk = 'rekam';
    this._rekorder = null;
  }

  init({ onKeluar }) {
    this.onKeluar = onKeluar;
    this.gerbang = document.getElementById('ortu-gerbang');
    this.isi = document.getElementById('ortu-isi');
    this.pasangGerbangLogo();
    this.pasangGerbangSoal();
    this.pasangTab();
    this.pasangSetelan();
    this.pasangRekam();
    this.pasangEkspor();
  }

  /* ---------- Gerbang akses ---------- */
  pasangGerbangLogo() {
    const logo = document.getElementById('logo');
    const bar = document.querySelector('#logo-bar span');
    if (!logo) return;
    let t0 = 0;
    let raf = 0;
    let timer = 0;

    const mulai = (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      t0 = performance.now();
      logo.classList.add('ditahan');
      const gerak = () => {
        const p = Math.min(1, (performance.now() - t0) / TAHAN_MS);
        if (bar) bar.style.width = `${p * 100}%`;
        if (p < 1) raf = requestAnimationFrame(gerak);
      };
      raf = requestAnimationFrame(gerak);
      timer = setTimeout(() => this.bukaGerbang(), TAHAN_MS);
    };
    const stop = () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      logo.classList.remove('ditahan');
      if (bar) bar.style.width = '0%';
    };
    logo.addEventListener('pointerdown', mulai);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    logo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.bukaGerbang(); }
    });
  }

  bukaGerbang() {
    ui.tampilkan('ortu');
    if (this.gerbang) this.gerbang.style.display = '';
    if (this.isi) this.isi.style.display = 'none';
    const inp = document.getElementById('ortu-jawab');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 120); }
    const salah = document.getElementById('ortu-salah');
    if (salah) salah.textContent = '';
  }

  pasangGerbangSoal() {
    const form = document.getElementById('ortu-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = document.getElementById('ortu-jawab');
      const salah = document.getElementById('ortu-salah');
      if (Number(inp.value) === JAWABAN) {
        this.terbuka = true;
        if (this.gerbang) this.gerbang.style.display = 'none';
        if (this.isi) this.isi.style.display = '';
        this.render();
      } else {
        if (salah) salah.textContent = 'Belum tepat, coba lagi.';
        inp.value = '';
        inp.focus();
      }
    });
  }

  /* ---------- Tab ---------- */
  pasangTab() {
    const tabs = [...document.querySelectorAll('.ortu-tab .tombol')];
    tabs.forEach((t) => {
      t.addEventListener('click', () => {
        tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
        document.querySelectorAll('.panel').forEach((p) => {
          p.classList.toggle('aktif', p.id === `panel-${t.dataset.panel}`);
        });
        if (t.dataset.panel === 'rekam') this.renderRekam();
      });
    });
  }

  /* ---------- Render statistik ---------- */
  render() {
    this.renderStatistik();
    this.renderSetelan();
    this.renderRekam();
  }

  renderStatistik() {
    const tbody = document.querySelector('#tabel-huruf tbody');
    if (tbody) {
      tbody.innerHTML = '';
      stats.perHuruf().forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="huruf-sel">${r.huruf}${r.huruf.toLowerCase()}</td>
          <td>${r.percobaan}</td>
          <td>${persen(r.akurasi)}</td>
          <td>${r.rata_ms ? `${(r.rata_ms / 1000).toFixed(1)}s` : '–'}</td>
          <td>${r.tingkat === 'belum' ? '–' : r.tingkat}</td>`;
        tbody.appendChild(tr);
      });
    }

    const sulit = document.getElementById('daftar-sulit');
    if (sulit) {
      const daftar = stats.tersulit(5);
      sulit.innerHTML = daftar.length
        ? daftar.map((r) => `<li><b>${r.huruf}${r.huruf.toLowerCase()}</b> — ${r.salah}x salah, akurasi ${persen(r.akurasi)}</li>`).join('')
        : '<li>Belum ada huruf yang sering salah.</li>';
    }

    const ringkas = document.getElementById('ortu-ringkas');
    if (ringkas) {
      ringkas.innerHTML = `
        <div class="baris-setelan"><span><span class="nama">Akurasi keseluruhan</span>
          <span class="ket">${stats.totalPercobaan()} percobaan tercatat</span></span>
          <b>${persen(stats.akurasiKeseluruhan())}</b></div>
        <div class="baris-setelan"><span><span class="nama">Main hari ini</span>
          <span class="ket">Minggu ini ${menit(stats.waktuMingguIni())}</span></span>
          <b>${menit(stats.waktuHariIni())}</b></div>
        <div class="baris-setelan"><span><span class="nama">Paket sekarang</span>
          <span class="ket">${progress.data.ronde_selesai} ronde selesai · ${progress.jumlahTingkat('hafal')} huruf hafal</span></span>
          <b>Paket ${progress.data.paket}</b></div>`;
    }

    this.renderGrafik();
  }

  renderGrafik() {
    const svg = document.getElementById('grafik-sesi');
    if (!svg) return;
    const data = stats.grafikSesi(7);
    // viewBox = ukuran piksel sebenarnya: batang mengisi lebar penuh dan teks
    // tidak ikut melar (SVG dengan viewBox tetap akan diperkecil & dipusatkan).
    const W = Math.max(200, Math.round(svg.clientWidth || 300));
    const H = Math.max(80, Math.round(svg.clientHeight || 100));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    if (!data.length) {
      svg.innerHTML = `<text x="8" y="${H / 2}">Belum ada sesi tercatat.</text>`;
      return;
    }
    const lebar = W / data.length;
    const bar = data.map((d, i) => {
      const h = Math.max(2, d.akurasi * (H - 34));
      const x = i * lebar + lebar * 0.18;
      const w = lebar * 0.64;
      const y = H - 18 - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>
        <text x="${(x + w / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle">${Math.round(d.akurasi * 100)}</text>
        <text x="${(x + w / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${d.tanggal.slice(5)}</text>`;
    }).join('');
    svg.innerHTML = `<line x1="0" y1="${H - 18}" x2="${W}" y2="${H - 18}"/>${bar}`;
  }

  /* ---------- Pengaturan ---------- */
  pasangSetelan() {
    document.querySelectorAll('[data-setelan]').forEach((el) => {
      el.addEventListener('click', () => {
        const kunci = el.dataset.setelan;
        const nilai = !(el.getAttribute('aria-pressed') === 'true');
        progress.setSetelan(kunci, nilai);
        el.setAttribute('aria-pressed', String(nilai));
        this.terapkan(kunci, nilai);
      });
    });

    document.querySelectorAll('[data-suara]').forEach((el) => {
      el.addEventListener('click', () => {
        progress.setSetelan('mode_suara', el.dataset.suara);
        audio.modeSuara = el.dataset.suara;
        this.renderSetelan();
        this.renderRekam();
      });
    });

    document.querySelectorAll('[data-tier]').forEach((el) => {
      el.addEventListener('click', () => {
        const t = Number(el.dataset.tier);
        const daftar = progress.setelan.tier_aktif.slice();
        const i = daftar.indexOf(t);
        if (i >= 0) daftar.splice(i, 1); else daftar.push(t);
        if (!daftar.length) { ui.toast('Minimal satu tier harus aktif'); return; }
        progress.setSetelan('tier_aktif', daftar.sort());
        this.renderSetelan();
      });
    });

    const reset = document.getElementById('ortu-reset');
    if (reset) {
      let siap = false;
      reset.addEventListener('click', () => {
        if (!siap) {
          siap = true;
          reset.textContent = 'Yakin? Ketuk sekali lagi';
          setTimeout(() => { siap = false; reset.textContent = 'Reset progres'; }, 4000);
          return;
        }
        progress.reset();
        ui.rakRender();
        this.render();
        reset.textContent = 'Progres sudah direset';
        setTimeout(() => { reset.textContent = 'Reset progres'; }, 2500);
      });
    }
  }

  terapkan(kunci, nilai) {
    if (kunci === 'musik') audio.setMusik(nilai);
    if (kunci === 'bisu') audio.setBisu(nilai);
    if (kunci === 'getar' || kunci === 'reduced_motion') {
      document.dispatchEvent(new CustomEvent('th:gerak'));
    }
  }

  renderSetelan() {
    document.querySelectorAll('[data-setelan]').forEach((el) => {
      el.setAttribute('aria-pressed', String(!!progress.setelan[el.dataset.setelan]));
    });
    document.querySelectorAll('[data-suara]').forEach((el) => {
      el.setAttribute('aria-selected', String(progress.setelan.mode_suara === el.dataset.suara));
      el.classList.toggle('mint', progress.setelan.mode_suara === el.dataset.suara);
    });
    document.querySelectorAll('[data-tier]').forEach((el) => {
      el.setAttribute('aria-pressed', String(progress.setelan.tier_aktif.includes(Number(el.dataset.tier))));
    });
    const tts = document.getElementById('info-tts');
    if (tts) {
      tts.textContent = audio.ttsSiap
        ? 'Suara bahasa Indonesia perangkat: tersedia.'
        : 'Suara bahasa Indonesia tidak tersedia di perangkat ini — TTS dimatikan, andalkan rekaman sendiri.';
    }
  }

  /* ---------- Rekam suara huruf ---------- */
  pasangRekam() {
    document.querySelectorAll('[data-ketuk]').forEach((el) => {
      el.addEventListener('click', () => {
        this.modeKetuk = el.dataset.ketuk;
        document.querySelectorAll('[data-ketuk]').forEach((x) => {
          x.setAttribute('aria-selected', String(x === el));
          x.classList.toggle('mint', x === el);
        });
      });
    });
    const hapus = document.getElementById('rekam-hapus');
    if (hapus) {
      let siap = false;
      hapus.addEventListener('click', async () => {
        if (!siap) {
          siap = true;
          hapus.textContent = 'Yakin? Ketuk lagi';
          setTimeout(() => { siap = false; hapus.textContent = 'Hapus semua rekaman'; }, 4000);
          return;
        }
        const mode = progress.setelan.mode_suara;
        await Promise.all(ALFABET.map((h) => audio.hapusRekaman(mode, h).catch(() => {})));
        hapus.textContent = 'Rekaman dihapus';
        setTimeout(() => { hapus.textContent = 'Hapus semua rekaman'; }, 2500);
        this.renderRekam();
      });
    }
  }

  async renderRekam() {
    const wadah = document.getElementById('rekam-grid');
    if (!wadah) return;
    const mode = progress.setelan.mode_suara;
    const kunci = new Set(await audio.daftarRekaman());
    const catatan = document.getElementById('rekam-catatan');
    if (catatan) {
      const ada = typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia;
      catatan.textContent = ada
        ? `Merekam untuk mode "${mode === 'nama' ? 'nama huruf' : 'bunyi huruf'}". Ketuk satu huruf, bicara setelah titik merah muncul (1,6 detik).`
        : 'Perangkat ini tidak mendukung perekaman suara.';
    }
    wadah.innerHTML = '';
    ALFABET.forEach((h) => {
      const ada = kunci.has(`${mode}:${h}`);
      const sel = document.createElement('button');
      sel.type = 'button';
      sel.className = 'rekam-sel';
      sel.dataset.ada = ada ? '1' : '0';
      sel.innerHTML = `<span class="h">${h}${h.toLowerCase()}</span><span>${ada ? '● ada' : '○ kosong'}</span>`;
      sel.addEventListener('click', () => {
        if (this.modeKetuk === 'dengar') this.dengar(h);
        else this.rekam(h, sel);
      });
      wadah.appendChild(sel);
    });
  }

  async dengar(huruf) {
    const mode = progress.setelan.mode_suara;
    const ada = await audio.putarRekaman(mode, huruf);
    if (!ada) {
      if (audio.ttsSiap) audio.katakan(ejaan(huruf), { prioritas: true });
      else ui.toast('Belum ada rekaman untuk huruf ini');
    }
  }

  async rekam(huruf, sel) {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      ui.toast('Perekaman tidak didukung di perangkat ini');
      return;
    }
    if (this._rekorder) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      this._rekorder = rec;
      const bagian = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) bagian.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        this._rekorder = null;
        sel.classList.remove('merekam');
        const blob = new Blob(bagian, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          await audio.simpanRekaman(progress.setelan.mode_suara, huruf, blob);
          sel.dataset.ada = '1';
          sel.querySelector('span:last-child').textContent = '● ada';
          audio.putarRekaman(progress.setelan.mode_suara, huruf);
        }
      };
      sel.classList.add('merekam');
      rec.start();
      setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, REKAM_MS);
    } catch (e) {
      this._rekorder = null;
      sel.classList.remove('merekam');
      ui.toast('Izin mikrofon ditolak');
    }
  }

  /* ---------- Ekspor ---------- */
  pasangEkspor() {
    const btn = document.getElementById('ortu-ekspor');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const data = JSON.stringify(stats.ekspor(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const t = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `tembak-huruf-statistik-${t}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
}

export const panelOrtu = new PanelOrtu();
