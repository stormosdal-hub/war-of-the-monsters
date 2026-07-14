// HTML overlay HUD: health/energy plates, announcements, screen switching.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      name1: document.getElementById('name1'),
      hp1: document.getElementById('hp1'),
      trail1: document.getElementById('trail1'),
      en1: document.getElementById('en1'),
      bar1: document.getElementById('hp1').parentElement,
      foes: document.getElementById('foes'),
      announce: document.getElementById('announce'),
    };
    this.player = null;   // monsters[0] — the local player, shown with an energy bar
    this.foeEls = [];     // { m, fill, trail, row } for each opponent
    this.announceT = null;
  }

  // Free-for-all HUD: player[0] keeps the big plate; the rest get compact bars.
  bind(list) {
    this.player = list[0];
    this.el.name1.textContent = this.player.def.name;
    this.el.trail1.style.width = '100%';
    this.el.foes.innerHTML = '';
    this.foeEls = list.slice(1).map((m) => {
      const row = document.createElement('div');
      row.className = 'foe';
      row.innerHTML = `<div class="fname">${m.def.name}</div>` +
        `<div class="bar"><div class="trail" style="width:100%"></div><div class="fill"></div></div>`;
      this.el.foes.appendChild(row);
      return { m, fill: row.querySelector('.fill'), trail: row.querySelector('.trail'), row };
    });
    this.pokePlayer();
    for (const f of this.foeEls) this.pokeFoe(f);
  }

  // Called from applyDamage/heal for a specific monster, plus every frame in update().
  poke(m) {
    if (m === this.player) { this.pokePlayer(); return; }
    const f = this.foeEls.find((f) => f.m === m);
    if (f) this.pokeFoe(f);
  }

  pokePlayer() {
    const m = this.player, frac = Math.max(0, m.hp / m.maxHp);
    this.el.hp1.style.width = `${frac * 100}%`;
    this.el.trail1.style.width = `${frac * 100}%`; // CSS transition delay creates the white "damage trail"
    this.el.bar1.classList.toggle('hurt', frac < 0.55 && frac >= 0.25);
    this.el.bar1.classList.toggle('crit', frac < 0.25);
  }

  pokeFoe(f) {
    const frac = Math.max(0, f.m.hp / f.m.maxHp);
    f.fill.style.width = `${frac * 100}%`;
    f.trail.style.width = `${frac * 100}%`;
    f.fill.parentElement.classList.toggle('hurt', frac < 0.55 && frac >= 0.25);
    f.fill.parentElement.classList.toggle('crit', frac < 0.25);
    f.row.classList.toggle('dead', !f.m.alive);
  }

  update() {
    if (!this.player) return;
    this.pokePlayer();
    this.el.en1.style.width = `${this.player.energy}%`;
    for (const f of this.foeEls) this.pokeFoe(f);
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
  all: ['titleScreen', 'selectScreen', 'vsScreen', 'victoryScreen', 'pauseScreen', 'settingsScreen'],
  show(id) {
    for (const s of this.all) document.getElementById(s).classList.toggle('hidden', s !== id);
  },
  hideAll() {
    for (const s of this.all) document.getElementById(s).classList.add('hidden');
  },
};
