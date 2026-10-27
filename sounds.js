'use strict';

// Sonidos calmados sintetizados con Web Audio (sin archivos externos).
// Cada pieza suena como una piedra: un golpe seco y suave (ruido filtrado)
// más un cuerpo grave. Todo pasa por un filtro paso-bajo y volumen bajo.
const Sound = (() => {
  let actx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (muted) return false;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.35;
      const soften = actx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 1800;
      master.connect(soften).connect(actx.destination);

      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
    return true;
  }

  // Golpe de piedra: ruido filtrado con envolvente corta.
  function click({ freq, q = 1.2, dur = 0.08, vol = 0.5, delay = 0 }) {
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

  // Cuerpo grave de la roca.
  function thud({ freq, dur = 0.18, vol = 0.5, delay = 0 }) {
    const t = actx.currentTime + delay;
    const o = actx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Tono suave y largo (escala pentatónica) para despejar líneas.
  function tone({ freq, dur = 0.7, vol = 0.25, delay = 0 }) {
    const t = actx.currentTime + delay;
    const o = actx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C D E G A C

  return {
    // Desplazar: roce corto y sutil de piedra sobre piedra.
    move() {
      if (!ensure()) return;
      click({ freq: 900, q: 0.8, dur: 0.05, vol: 0.18 });
    },
    // Girar: dos golpecitos de roca, el segundo más grave.
    rotate() {
      if (!ensure()) return;
      click({ freq: 1400, q: 1.5, dur: 0.05, vol: 0.3 });
      click({ freq: 700, q: 1.5, dur: 0.07, vol: 0.3, delay: 0.045 });
      thud({ freq: 180, dur: 0.1, vol: 0.12, delay: 0.045 });
    },
    // Acomodar: la piedra se asienta con un golpe sordo.
    lock() {
      if (!ensure()) return;
      click({ freq: 500, q: 0.9, dur: 0.1, vol: 0.45 });
      thud({ freq: 120, dur: 0.22, vol: 0.5 });
    },
    // Caída: un golpe más profundo y pesado, pero aún suave.
    drop() {
      if (!ensure()) return;
      click({ freq: 380, q: 0.7, dur: 0.16, vol: 0.55 });
      thud({ freq: 85, dur: 0.35, vol: 0.7 });
    },
    // Línea completa: piedras que se liberan + tonos pentatónicos tranquilos.
    clear(n = 1) {
      if (!ensure()) return;
      click({ freq: 600, q: 0.8, dur: 0.25, vol: 0.3 });
      for (let i = 0; i < Math.min(n + 2, 5); i++) {
        tone({ freq: PENTA[i + 1], delay: i * 0.12 });
      }
    },
    // Fin del juego: tonos descendentes lentos, sin disonancia.
    gameOver() {
      if (!ensure()) return;
      [PENTA[4], PENTA[3], PENTA[2], PENTA[0]].forEach((f, i) =>
        tone({ freq: f / 2, dur: 1.2, vol: 0.28, delay: i * 0.3 }));
      thud({ freq: 70, dur: 0.6, vol: 0.4, delay: 0.9 });
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted: () => muted,
  };
})();
