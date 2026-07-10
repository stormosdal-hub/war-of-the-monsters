// HTML overlay HUD: health/energy plates, announcements, screen switching.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      name1: document.getElementById('name1'),
      name2: document.getElementById('name2'),
      hp1: document.getElementById('hp1'),
      hp2: document.getElementById('hp2'),
      trail1: document.getElementById('trail1'),
      trail2: document.getElementById('trail2'),
      en1: document.getElementById('en1'),
      en2: document.getElementById('en2'),
      bar1: document.getElementById('hp1').parentElement,
      bar2: document.getElementById('hp2').parentElement,
      announce: document.getElementById('announce'),
    };
    this.m1 = null;
    this.m2 = null;
    this.announceT = null;
  }

  bind(m1, m2) {
    this.m1 = m1; this.m2 = m2;
    this.el.name1.textContent = m1.def.name;
    this.el.name2.textContent = m2.def.name;
    this.el.trail1.style.width = '100%';
    this.el.trail2.style.width = '100%';
    this.poke(m1); this.poke(m2);
  }

  poke(m) {
    const isP1 = m === this.m1;
    const fill = isP1 ? this.el.hp1 : this.el.hp2;
    const trail = isP1 ? this.el.trail1 : this.el.trail2;
    const bar = isP1 ? this.el.bar1 : this.el.bar2;
    const frac = m.hp / m.maxHp;
    fill.style.width = `${frac * 100}%`;
    trail.style.width = `${frac * 100}%`; // CSS transition delay creates the white "damage trail"
    bar.classList.toggle('hurt', frac < 0.55 && frac >= 0.25);
    bar.classList.toggle('crit', frac < 0.25);
  }

  update() {
    if (!this.m1) return;
    this.el.en1.style.width = `${this.m1.energy}%`;
    this.el.en2.style.width = `${this.m2.energy}%`;
  }

  announce(text, dur = 1.4) {
    const a = this.el.announce;
    a.textContent = text;
    a.classList.add('show');
    if (this.announceT) clearTimeout(this.announceT);
    if (dur > 0) this.announceT = setTimeout(() => a.classList.remove('show'), dur * 1000);
  }

  clearAnnounce() { this.el.announce.classList.remove('show'); }
}

// Screen manager for the HTML menu overlays.
export const screens = {
  all: ['titleScreen', 'selectScreen', 'vsScreen', 'victoryScreen', 'pauseScreen'],
  show(id) {
    for (const s of this.all) document.getElementById(s).classList.toggle('hidden', s !== id);
  },
  hideAll() {
    for (const s of this.all) document.getElementById(s).classList.add('hidden');
  },
};
