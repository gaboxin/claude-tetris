'use strict';

// Sonidos sintetizados con Web Audio (sin archivos externos).
// Cada tema tiene su propio "perfil" de sonido: una lista de pasos por evento.
//   { k: 'c', freq, q, dur, vol, delay }                      -> golpe de ruido filtrado
//   { k: 'o', type, freq, end, dur, vol, delay, atk }         -> oscilador (con barrido opcional a `end`)
const Sound = (() => {
  let actx = null;
  let master = null;
  let soften = null;
  let noiseBuf = null;
  let muted = false;

  // ---- Utilidades para armar perfiles ----
  const o = (type, freq, dur, vol, delay = 0, end = freq, atk = 0.01) =>
    ({ k: 'o', type, freq, end, dur, vol, delay, atk });
  const c = (freq, q, dur, vol, delay = 0) => ({ k: 'c', freq, q, dur, vol, delay });
  // Arpegio: una nota tras otra.
  const arp = (notes, type, gap, dur, vol, atk = 0.02) =>
    notes.map((f, i) => o(type, f, dur, vol, i * gap, f, atk));

  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C D E G A C
  const MAJOR = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];
  const WHOLE = [261.63, 293.66, 329.63, 369.99, 415.3, 466.16, 523.25];
  const DORIAN = [293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];

  const PROFILES = {
    // Piedras calmadas (el original).
    clasico: {
      filter: 1800,
      move: [c(900, 0.8, 0.05, 0.18)],
      rotate: [c(1400, 1.5, 0.05, 0.3), c(700, 1.5, 0.07, 0.3, 0.045), o('sine', 180, 0.1, 0.12, 0.045, 108)],
      lock: [c(500, 0.9, 0.1, 0.45), o('sine', 120, 0.22, 0.5, 0, 72)],
      drop: [c(380, 0.7, 0.16, 0.55), o('sine', 85, 0.35, 0.7, 0, 51)],
      clear: n => [c(600, 0.8, 0.25, 0.3),
        ...arp(PENTA.slice(1, 1 + Math.min(n + 2, 5)), 'triangle', 0.12, 0.7, 0.25, 0.04)],
      over: [...arp([PENTA[4], PENTA[3], PENTA[2], PENTA[0]].map(f => f / 2), 'triangle', 0.3, 1.2, 0.28, 0.04),
        o('sine', 70, 0.6, 0.4, 0.9, 42)],
    },

    // Láseres, ecos y whooshes. En el espacio nadie te oye tropezar... pero igual suena.
    espacial: {
      filter: 3200,
      move: [o('sine', 1200, 0.06, 0.12, 0, 1500)],
      rotate: [o('sine', 500, 0.14, 0.2, 0, 1400), o('sine', 1400, 0.1, 0.1, 0.1, 900)],
      lock: [o('sine', 220, 0.3, 0.45, 0, 90), c(2500, 2, 0.08, 0.15)],
      drop: [o('sawtooth', 900, 0.35, 0.2, 0, 60), o('sine', 70, 0.45, 0.6, 0.05, 40)],
      clear: n => [c(3000, 0.5, 0.4, 0.2),
        ...arp(MAJOR.slice(2, 2 + Math.min(n + 3, 6)).map(f => f * 2), 'sine', 0.09, 0.9, 0.2, 0.03)],
      over: [o('sine', 600, 1.6, 0.35, 0, 40, 0.05), o('sine', 300, 1.8, 0.25, 0.2, 30, 0.05), c(400, 0.4, 1.0, 0.15, 0.4)],
    },

    // Superposición: cada nota viene con su gemela desafinada (¿suena o no suena? Ambas).
    cuantico: {
      filter: 3000,
      move: [o('sine', 880, 0.05, 0.1), o('sine', 893, 0.05, 0.1)],
      rotate: [o('sine', 523, 0.12, 0.15, 0, 784), o('sine', 784, 0.12, 0.15, 0, 523)],
      lock: [o('sine', 196, 0.25, 0.35), o('sine', 207, 0.25, 0.35), o('triangle', 1568, 0.08, 0.08, 0.02)],
      drop: [o('sine', 1000, 0.3, 0.2, 0, 100), o('sine', 100, 0.4, 0.5, 0.02, 50), o('sine', 107, 0.4, 0.4, 0.02, 53)],
      clear: n => WHOLE.slice(0, Math.min(n + 3, 6)).flatMap((f, i) =>
        [o('sine', f * 2, 0.8, 0.14, i * 0.08, f * 2, 0.03), o('sine', f * 2 * 1.007, 0.8, 0.14, i * 0.08, f * 2 * 1.007, 0.03)]),
      // El gato de Schrödinger: la onda colapsa.
      over: [o('sine', 880, 1.4, 0.3, 0, 110, 0.03), o('sine', 932, 1.4, 0.3, 0, 117, 0.03), o('sine', 60, 0.5, 0.4, 1.2, 40)],
    },

    // Burbujas, vidrio y un poquito de ácido burbujeante.
    quimico: {
      filter: 4000,
      move: [o('sine', 500, 0.05, 0.15, 0, 900)],
      rotate: [o('sine', 400, 0.08, 0.22, 0, 1000), o('sine', 600, 0.07, 0.18, 0.07, 1400)],
      lock: [o('triangle', 1760, 0.18, 0.2), o('triangle', 2349, 0.14, 0.12, 0.03), o('sine', 160, 0.15, 0.3)],
      drop: [c(3500, 0.5, 0.25, 0.3), o('sine', 300, 0.1, 0.3, 0, 900), o('sine', 100, 0.3, 0.5, 0.05, 60)],
      clear: n => [c(5000, 0.4, 0.4, 0.15),
        ...Array.from({ length: 4 + n * 2 }, (_, i) =>
          o('sine', 400 + ((i * 337) % 700), 0.09, 0.2, i * 0.06, 900 + ((i * 211) % 900))),
        ...arp([MAJOR[4], MAJOR[6], MAJOR[7] * 1.19], 'triangle', 0.1, 0.5, 0.15)],
      // Se cayó el matraz.
      over: [c(4500, 1.5, 0.15, 0.35), c(3500, 1.5, 0.15, 0.3, 0.06), c(2800, 1.2, 0.2, 0.3, 0.12),
        c(1500, 0.3, 1.2, 0.2, 0.3), o('sawtooth', 300, 1.2, 0.12, 0.3, 60)],
    },

    // Beeps de 8 bits, teclas mecánicas y un "error" final (Segmentation fault, core dumped).
    developer: {
      filter: 5000,
      move: [c(3000, 3, 0.02, 0.2)],
      rotate: [c(2500, 3, 0.02, 0.25), c(1800, 3, 0.03, 0.25, 0.05)],
      lock: [o('square', 220, 0.1, 0.18), c(1200, 2, 0.05, 0.3)],
      drop: [o('square', 440, 0.18, 0.18, 0, 55), c(900, 1, 0.1, 0.35)],
      // Test suite en verde.
      clear: n => arp([MAJOR[0], MAJOR[2], MAJOR[4], MAJOR[7]].slice(0, Math.min(n + 2, 4)).map(f => f * 2),
        'square', 0.08, 0.14, 0.14, 0.005),
      over: [o('square', 220, 0.18, 0.2), o('square', 220, 0.18, 0.2, 0.28), o('square', 110, 0.5, 0.22, 0.56, 90)],
    },

    // Arcoíris: escala mayor brillante y alegre. El game over también es fabuloso.
    orgullo: {
      filter: 3500,
      move: [o('sine', 660, 0.05, 0.14, 0, 700)],
      rotate: [o('triangle', 523, 0.07, 0.2), o('triangle', 784, 0.09, 0.2, 0.06)],
      lock: [o('triangle', 392, 0.2, 0.3), o('sine', 98, 0.2, 0.4), c(2800, 2, 0.05, 0.12)],
      drop: [o('triangle', 784, 0.25, 0.2, 0, 196), o('sine', 80, 0.35, 0.6, 0.02, 50)],
      clear: n => [
        ...arp(MAJOR.slice(0, 7).map(f => f * 1.5), 'triangle', 0.075, 0.5, 0.2, 0.02),
        ...(n >= 4 ? arp([MAJOR[7] * 2, MAJOR[7] * 2.5], 'sine', 0.1, 0.8, 0.2).map(s => ({ ...s, delay: s.delay + 0.55 })) : []),
      ],
      // Glissando descendente con mucha clase: the show must go on.
      over: [...arp([MAJOR[7], MAJOR[6], MAJOR[5], MAJOR[4], MAJOR[2], MAJOR[0]], 'triangle', 0.18, 0.9, 0.25, 0.03),
        o('sine', 90, 0.7, 0.35, 1.1, 55)],
    },

    // Tambores de barco, maderas crujiendo y una melodía de taberna en dórico.
    pirata: {
      filter: 2200,
      move: [c(300, 1.5, 0.06, 0.3), o('sine', 140, 0.06, 0.2)],
      rotate: [o('triangle', 330, 0.07, 0.25, 0, 280), o('triangle', 262, 0.1, 0.25, 0.07, 220), c(500, 2, 0.04, 0.15)],
      lock: [c(250, 1, 0.12, 0.5), o('sine', 100, 0.25, 0.6, 0, 60)],
      drop: [c(200, 0.6, 0.2, 0.6), o('sine', 70, 0.4, 0.8, 0, 38), o('sine', 55, 0.4, 0.6, 0.15, 35)],
      clear: n => arp([DORIAN[0], DORIAN[2], DORIAN[4], DORIAN[3], DORIAN[4], DORIAN[6]].slice(0, Math.min(n + 3, 6)),
        'sawtooth', 0.14, 0.4, 0.12, 0.02),
      // Trombón triste: wah wah wah wahhh.
      over: [o('sawtooth', 247, 0.4, 0.2, 0, 233), o('sawtooth', 233, 0.4, 0.2, 0.45, 220),
        o('sawtooth', 220, 0.4, 0.2, 0.9, 208), o('sawtooth', 208, 1.2, 0.2, 1.35, 147, 0.02)],
    },

    // Xilófono de caramelo, pops de azúcar y un "blup" final de gelatina.
    dulces: {
      filter: 4500,
      move: [o('sine', 1318, 0.05, 0.14)],
      rotate: [o('sine', 1046, 0.08, 0.2), o('sine', 1568, 0.1, 0.2, 0.06)],
      lock: [o('sine', 330, 0.16, 0.4, 0, 250), c(3500, 2, 0.04, 0.2)],
      drop: [o('sine', 200, 0.3, 0.6, 0, 80), o('sine', 800, 0.1, 0.2, 0, 300), c(2000, 1, 0.08, 0.2)],
      clear: n => arp(PENTA.concat([659.25, 784]).slice(1, 1 + Math.min(n + 3, 6)).map(f => f * 2),
        'sine', 0.07, 0.35, 0.22, 0.005),
      over: [o('sine', 700, 0.6, 0.3, 0, 120, 0.02), o('sine', 500, 0.5, 0.25, 0.4, 80, 0.02), o('sine', 120, 0.5, 0.3, 0.8, 70)],
    },

    // Pisadas gigantes, rugidos y un final rotundamente extinto.
    dinos: {
      filter: 1400,
      move: [o('sine', 90, 0.07, 0.3, 0, 70)],
      rotate: [o('sawtooth', 160, 0.12, 0.18, 0, 110), c(400, 1, 0.08, 0.25)],
      lock: [o('sine', 70, 0.35, 0.8, 0, 40), c(250, 0.6, 0.15, 0.5)],
      drop: [o('sine', 55, 0.6, 0.9, 0, 30), c(180, 0.5, 0.3, 0.6), o('sine', 45, 0.5, 0.7, 0.25, 28)],
      clear: n => [o('sawtooth', 200, 0.7, 0.25, 0, 110, 0.05),
        ...arp([130.81, 164.81, 196, 261.63].slice(0, Math.min(n + 1, 4)), 'sawtooth', 0.16, 0.5, 0.15, 0.03)],
      // Roar de extinción.
      over: [o('sawtooth', 300, 1.5, 0.3, 0, 50, 0.1), o('sawtooth', 150, 1.5, 0.25, 0.05, 40, 0.1), c(300, 0.4, 1.4, 0.3),
        o('sine', 40, 0.8, 0.9, 1.5, 25)],
    },
  };

  let profile = PROFILES.clasico;

  function ensure() {
    if (muted) return false;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.35;
      soften = actx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = profile.filter;
      master.connect(soften).connect(actx.destination);

      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
    return true;
  }

  // Golpe: ruido filtrado con envolvente corta.
  function click({ freq, q, dur, vol, delay }) {
    const t = actx.currentTime + delay;
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * (0.95 + Math.random() * 0.1); // variación leve
    bp.Q.value = q;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t, Math.random() * 0.3, dur + 0.05);
  }

  // Oscilador con envolvente y barrido opcional de frecuencia.
  function osc({ type, freq, end, dur, vol, delay, atk }) {
    const t = actx.currentTime + delay;
    const n = actx.createOscillator();
    n.type = type;
    n.frequency.setValueAtTime(freq, t);
    if (end !== freq) n.frequency.exponentialRampToValueAtTime(end, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(g).connect(master);
    n.start(t);
    n.stop(t + dur + 0.02);
  }

  function play(steps) {
    if (!ensure()) return;
    for (const s of steps) (s.k === 'c' ? click : osc)(s);
  }

  return {
    move: () => play(profile.move),
    rotate: () => play(profile.rotate),
    lock: () => play(profile.lock),
    drop: () => play(profile.drop),
    clear: (n = 1) => play(profile.clear(n)),
    gameOver: () => play(profile.over),
    // Cambia el perfil de sonido y toca un pequeño jingle de muestra.
    setTheme(id, preview = true) {
      profile = PROFILES[id] || PROFILES.clasico;
      if (soften) soften.frequency.value = profile.filter;
      if (preview) this.clear(2);
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted: () => muted,
  };
})();
