// Sonido de la sesión, todo generado al vuelo con Web Audio (sin archivos): motores, público, lluvia, viento,
// pistolas de la parada, semáforos de la salida y choques. Solo interfaz: no toca la simulación, así que puede usar
// Math.random(). El AudioContext solo se puede crear tras tocar la pantalla: se crea con unlock() desde un toque
// (botón de velocidad o de 3D) y se suspende en pausa, al salir de la sesión y con la página oculta.

export interface SoundPrefs {
  sonido: boolean;
  volumen: number; // 0..1, general
  motores: number; // 0..1
  ambiente: number; // 0..1
  radio: number; // 0..1
  voz?: boolean; // leer en voz alta los mensajes importantes de la radio (voz del sistema en español)
  vozLobato?: boolean; // y los comentarios de Lobato, con otra voz
}
export const DEFAULT_SOUND: SoundPrefs = { sonido: true, volumen: 0.7, motores: 0.8, ambiente: 0.7, radio: 0.8, voz: false, vozLobato: false };

/** Un coche que se oye, visto desde quien escucha (la cámara en 3D, el coche seguido en 2D). */
export interface CarHeard {
  id: number;
  dist: number; // m
  closing: number; // m/s (tiempo real) a los que se acerca (negativo: se aleja), para el Doppler
  pan: number; // -1 izquierda … 1 derecha
  v: number; // m/s (velocidad del coche en la simulación)
  onboard?: boolean; // cámara a bordo de este coche
}
export interface PitStopHeard { id: number; u: number; dist: number; pan: number } // u: fase de la parada (0 se para, 1 sale)

export interface AudioFrame {
  running: boolean; // la sesión corre (fuera de pausa)
  speed: number; // velocidad de simulación (× tiempo real)
  simDt: number; // segundos de simulación desde el último fotograma
  cars: CarHeard[];
  crowd: number; // 0..1, cuánto público cerca
  rain: number; // 0..1
  wind: number; // km/h
  stops: PitStopHeard[];
}

// caja de 8 marchas: velocidad (km/h) a la que se llega al corte en cada una
const GEAR_TOP = [92, 128, 160, 192, 225, 262, 300, 345];
const RPM_MAX = 11800, RPM_IDLE = 4200;
/** Marcha (1-8) para una velocidad (m/s), con algo de histéresis respecto a la anterior. */
export function gearFor(v: number, prev = 1): number {
  const kmh = v * 3.6;
  let g = 1;
  while (g < 8 && kmh > GEAR_TOP[g - 1] * 0.96) g++;
  // no reduce hasta bajar bastante de la marcha inferior (como en la realidad, reducciones tardías)
  if (g < prev && kmh > GEAR_TOP[g - 1] * 0.78) g = prev;
  return g;
}
export function rpmFor(v: number, gear: number): number {
  const kmh = v * 3.6;
  return Math.max(RPM_IDLE, Math.min(RPM_MAX * 1.01, (RPM_MAX * kmh) / GEAR_TOP[gear - 1]));
}

const MAX_VOICES = 6;
const SOUND_C = 343;

interface Voice {
  id: number;
  out: GainNode; // ganancia por distancia
  pan: StereoPannerNode;
  lp: BiquadFilterNode;
  shelf: BiquadFilterNode;
  o1: OscillatorNode; o2: OscillatorNode; o3: OscillatorNode;
  g1: GainNode; g2: GainNode; g3: GainNode;
  nz: GainNode; // escape (ruido)
  nzF: BiquadFilterNode;
  gear: number; prevV: number; thr: number; dip: number; lastPop: number;
  free: boolean;
}

export type Audio = ReturnType<typeof createAudio>;

export function createAudio(initial: SoundPrefs) {
  let prefs = { ...initial };
  let ctx: AudioContext | null = null;
  let master: GainNode, engBus: GainNode, ambBus: GainNode, sfxBus: GainNode, radioBus: GainNode, radioOut: GainNode, duckG: GainNode;
  let noiseBuf: AudioBuffer, pinkBuf: AudioBuffer;
  let crowdG: GainNode, crowdF: BiquadFilterNode, rainG: GainNode, windG: GainNode, windF: BiquadFilterNode;
  const voices: Voice[] = [];
  let lastParam = 0, cheerUntil = 0, cheerK = 0, silenceUntil = 0;
  const stopSeen = new Map<number, { off: boolean; on: boolean }>();
  let want = false; // la sesión quiere sonar (no en pausa)

  const AC: typeof AudioContext | undefined = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;

  function makeNoise(c: AudioContext, pink: boolean): AudioBuffer {
    const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      // ruido rosa (aproximación de Paul Kellet)
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return b;
  }
  const loop = (buf: AudioBuffer) => { const s = ctx!.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 1.5); return s; };
  const gainN = (v: number, to: AudioNode) => { const g = ctx!.createGain(); g.gain.value = v; g.connect(to); return g; };
  const filt = (type: BiquadFilterType, f: number, q = 0.7) => { const b = ctx!.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  function build() {
    const c = ctx!;
    // un compresor a la salida: que un choque con el público rugiendo no sature
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    comp.connect(c.destination);
    master = gainN(0, comp);
    duckG = gainN(1, master); // baja todo menos la radio mientras habla alguien
    engBus = gainN(1, duckG); ambBus = gainN(1, duckG); sfxBus = gainN(1, duckG);
    // la radio suena también con la sesión en pausa (muchos mensajes la paran): va por su lado, sin la puerta de master
    radioOut = gainN(prefs.sonido ? prefs.volumen : 0, comp); radioBus = gainN(1, radioOut);
    noiseBuf = makeNoise(c, false); pinkBuf = makeNoise(c, true);
    // público: ruido rosa por un paso banda de voces
    crowdF = filt("bandpass", 900, 0.6); crowdG = gainN(0, ambBus); crowdF.connect(crowdG); loop(pinkBuf).connect(crowdF);
    // lluvia: ruido blanco agudo
    const rf = filt("highpass", 1800), rf2 = filt("lowpass", 9000); rainG = gainN(0, ambBus); rf.connect(rf2).connect(rainG); loop(noiseBuf).connect(rf);
    // viento: rosa muy grave, que va y viene
    windF = filt("lowpass", 380); windG = gainN(0, ambBus); windF.connect(windG); loop(pinkBuf).connect(windF);
    applyPrefs();
  }

  function applyPrefs() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(prefs.sonido && want ? prefs.volumen : 0, t, 0.05);
    engBus.gain.setTargetAtTime(prefs.motores * 0.75, t, 0.05);
    ambBus.gain.setTargetAtTime(prefs.ambiente, t, 0.05);
    sfxBus.gain.setTargetAtTime(Math.max(prefs.ambiente, 0.4) * 0.9, t, 0.05);
    radioBus.gain.setTargetAtTime(prefs.radio, t, 0.05);
    radioOut.gain.setTargetAtTime(prefs.sonido ? prefs.volumen : 0, t, 0.05);
  }

  // ---- voz (speechSynthesis): la del sistema en español; si no hay, sin voz
  const synth: SpeechSynthesis | null = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  let lastSpeak = -1e9, talking = 0;
  function spanishVoices(): SpeechSynthesisVoice[] {
    if (!synth) return [];
    const vs = synth.getVoices().filter((v) => /^es/i.test(v.lang));
    return vs.sort((a, b) => Number(/es-ES/i.test(b.lang)) - Number(/es-ES/i.test(a.lang)));
  }
  synth?.getVoices(); // algunos navegadores las cargan la primera vez que se piden
  /** Lee un texto: «radio» (tus pilotos y el ingeniero, como mucho uno cada 8 s) o «lobato» (otra voz). */
  function speak(text: string, who: "radio" | "lobato", tone?: { pitch: number; rate: number }): boolean {
    if (!synth || !prefs.sonido || (who === "radio" ? !prefs.voz : !prefs.vozLobato)) return false;
    const now = performance.now();
    if (synth.speaking || synth.pending || now - lastSpeak < 8000) return false;
    const vs = spanishVoices();
    if (!vs.length) return false;
    const u = new SpeechSynthesisUtterance(text);
    // Lobato, con otra voz si la hay (y si no, más grave y más deprisa)
    u.voice = who === "lobato" ? vs[1] ?? vs[0] : vs[0];
    u.lang = u.voice.lang;
    u.rate = who === "lobato" ? 1.12 : 1.05;
    u.pitch = who === "lobato" && !vs[1] ? 0.8 : 1;
    // cada piloto con su tono (voces.ts)
    if (tone) { u.pitch = tone.pitch; u.rate = tone.rate; }
    u.volume = Math.max(0.05, prefs.volumen * (who === "radio" ? prefs.radio : prefs.ambiente));
    const end = () => { if (--talking <= 0) { talking = 0; duck(false); } };
    u.onstart = () => { talking++; duck(true); };
    u.onend = end; u.onerror = end;
    lastSpeak = now;
    synth.speak(u);
    return true;
  }
  function duck(on: boolean) { if (ctx) duckG.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.12); }

  function newVoice(): Voice {
    const c = ctx!;
    const out = c.createGain(); out.gain.value = 0;
    const pan = c.createStereoPanner(); out.connect(pan).connect(engBus);
    const shelf = filt("lowshelf", 160); shelf.gain.value = 0; shelf.connect(out);
    const lp = filt("lowpass", 2500, 1.2); lp.connect(shelf);
    const osc = (type: OscillatorType, g: number) => { const o = c.createOscillator(); o.type = type; const gg = c.createGain(); gg.gain.value = g; o.connect(gg).connect(lp); o.start(); return [o, gg] as const; };
    const [o1, g1] = osc("sawtooth", 0.5), [o2, g2] = osc("square", 0.22), [o3, g3] = osc("sawtooth", 0.18);
    const nzF = filt("bandpass", 1200, 0.8), nz = c.createGain(); nz.gain.value = 0.15;
    const ns = c.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true; ns.start(0, Math.random() * 1.5);
    ns.connect(nzF).connect(nz).connect(lp);
    return { id: -1, out, pan, lp, shelf, o1, o2, o3, g1, g2, g3, nz, nzF, gear: 1, prevV: 0, thr: 1, dip: 0, lastPop: 0, free: true };
  }

  /** Un estallido corto de ruido filtrado (petardeo, pistola, choque…). */
  function burst(bus: GainNode, when: number, dur: number, gain: number, type: BiquadFilterType, f: number, q = 1, pan = 0) {
    const c = ctx!;
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const b = filt(type, f, q), g = c.createGain(), p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
    s.connect(b).connect(g).connect(p).connect(bus);
    s.start(when, Math.random() * 1.5, dur + 0.05);
  }
  function tone(bus: GainNode, when: number, dur: number, f: number, gain: number, type: OscillatorType = "sine", f2?: number) {
    const c = ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, when); if (f2) o.frequency.exponentialRampToValueAtTime(f2, when + dur);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
    o.connect(g).connect(bus); o.start(when); o.stop(when + dur + 0.05);
  }

  /** Pistola neumática: un «brrrt» corto (0,15 s) con su chasquido. */
  function gun(when: number, gain: number, pan: number) {
    burst(sfxBus, when, 0.15, gain, "bandpass", 2600 + Math.random() * 900, 2.5, pan);
    burst(sfxBus, when, 0.06, gain * 0.7, "highpass", 4000, 0.7, pan);
  }

  function updateVoice(vo: Voice, h: CarHeard, f: AudioFrame, t: number, nVoices: number) {
    const v = h.v;
    const g = gearFor(v, vo.gear);
    if (g > vo.gear) vo.dip = t + 0.07; // al subir de marcha, el régimen cae un instante
    vo.gear = g;
    // acelerador según cómo cambia la velocidad (en segundos de simulación)
    const acc = f.simDt > 0 ? (v - vo.prevV) / f.simDt : 0;
    vo.prevV = v;
    const thrWant = acc > 0.6 ? 1 : acc < -3 ? 0 : 0.55;
    if (vo.thr > 0.8 && thrWant === 0 && t - vo.lastPop > 0.5 && h.dist < 120) {
      // al soltar el acelerador, petardeo en el escape
      vo.lastPop = t;
      const near = Math.min(1, 25 / Math.max(8, h.dist));
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) burst(engBus, t + 0.04 + i * (0.04 + Math.random() * 0.05), 0.05, 0.35 * near, "bandpass", 500 + Math.random() * 500, 1.5, h.pan);
    }
    vo.thr += (thrWant - vo.thr) * 0.35;
    let rpm = rpmFor(v, g) * (t < vo.dip ? 0.9 : 1);
    if (v < 2) rpm = RPM_IDLE * (0.95 + 0.1 * vo.thr);
    // Doppler: más agudo al acercarse, más grave al alejarse
    const dop = h.onboard ? 1 : SOUND_C / Math.max(80, SOUND_C - Math.max(-150, Math.min(150, h.closing)));
    const fire = (rpm / 60) * 3 * dop; // V6, cuatro tiempos: tres explosiones por vuelta
    const k = 0.04;
    vo.o1.frequency.setTargetAtTime(fire, t, k);
    vo.o2.frequency.setTargetAtTime(fire * 0.5, t, k);
    vo.o3.frequency.setTargetAtTime(fire * 2.01, t, k);
    vo.nzF.frequency.setTargetAtTime(fire * 1.5, t, k);
    // con acelerador, más brillo y más fuerte
    const bright = 900 + 4200 * vo.thr * (rpm / RPM_MAX);
    vo.lp.frequency.setTargetAtTime(h.onboard ? bright * 1.3 : bright, t, k);
    vo.shelf.gain.setTargetAtTime(h.onboard ? 9 : 0, t, 0.1);
    vo.g3.gain.setTargetAtTime(0.06 + 0.16 * vo.thr, t, k);
    vo.nz.gain.setTargetAtTime(0.08 + 0.18 * vo.thr, t, k);
    // ganancia por distancia (a 15 m, entera) y menos densidad a velocidades altas
    const dg = h.onboard ? 1.25 : Math.min(1, Math.pow(15 / Math.max(15, h.dist), 1.0));
    const dense = f.speed >= 4 ? 0.6 : 1;
    vo.out.gain.setTargetAtTime(dg * (0.55 + 0.45 * vo.thr) * dense / Math.sqrt(Math.max(1, nVoices * 0.6)), t, 0.06);
    vo.pan.pan.setTargetAtTime(h.onboard ? 0 : Math.max(-1, Math.min(1, h.pan)) * 0.8, t, 0.06);
  }

  function frame(f: AudioFrame, now: number) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const on = f.running && prefs.sonido;
    if (on !== want) { want = on; if (on && ctx.state === "suspended") void ctx.resume().catch(() => {}); applyPrefs(); if (!on) setTimeout(() => { if (!want && ctx && ctx.state === "running") void ctx.suspend().catch(() => {}); }, 150); }
    if (!on) return;
    if (now - lastParam < 33) return; // parámetros unas 30 veces por segundo
    lastParam = now;
    const quiet = t < silenceUntil;
    // ---- motores
    const maxV = f.speed > 8 ? 0 : f.speed >= 4 ? 3 : MAX_VOICES;
    const heard = f.cars.slice().sort((a, b) => (b.onboard ? 1 : 0) - (a.onboard ? 1 : 0) || a.dist - b.dist).filter((h) => h.dist < 600).slice(0, maxV);
    const onboard = heard.find((h) => h.onboard);
    const list = onboard ? [onboard] : heard;
    const ids = new Set(list.map((h) => h.id));
    for (const vo of voices) if (!vo.free && !ids.has(vo.id)) { vo.out.gain.setTargetAtTime(0, t, 0.08); vo.free = true; vo.id = -1; }
    for (const h of list) {
      let vo = voices.find((x) => x.id === h.id);
      if (!vo) {
        vo = voices.find((x) => x.free) ?? (voices.length < MAX_VOICES ? (voices.push(newVoice()), voices[voices.length - 1]) : undefined);
        if (!vo) continue;
        vo.free = false; vo.id = h.id; vo.prevV = h.v; vo.gear = gearFor(h.v); vo.thr = 0.6;
      }
      updateVoice(vo, h, f, t, list.length);
    }
    engBus.gain.setTargetAtTime(quiet ? 0.02 : prefs.motores * 0.75, t, quiet ? 0.03 : 0.25);
    // ---- ambiente
    const cheer = t < cheerUntil ? cheerK * Math.min(1, (cheerUntil - t) / 1.2) : 0;
    crowdG.gain.setTargetAtTime(quiet ? 0.01 : 0.05 + 0.25 * f.crowd + 0.5 * cheer, t, cheer > 0 ? 0.15 : 0.6);
    crowdF.frequency.setTargetAtTime(800 + 600 * cheer, t, 0.3);
    rainG.gain.setTargetAtTime(0.32 * Math.min(1, f.rain), t, 0.8);
    const gust = 0.75 + 0.25 * Math.sin(now / 1700) * Math.sin(now / 2900);
    windG.gain.setTargetAtTime(Math.min(0.5, (f.wind / 45) ** 1.5) * gust, t, 0.5);
    windF.frequency.setTargetAtTime(260 + 4 * f.wind, t, 0.5);
    // ---- pistolas: al quitar las ruedas (u = 0,12) y al apretar las nuevas (u ≈ 0,55)
    const live = new Set<number>();
    for (const st of f.stops) {
      live.add(st.id);
      const seen = stopSeen.get(st.id) ?? { off: false, on: false };
      const g = Math.min(0.7, 20 / Math.max(10, st.dist));
      if (!seen.off && st.u >= 0.12 && st.u < 0.62) { seen.off = true; for (let i = 0; i < 4; i++) gun(t + i * 0.035 + Math.random() * 0.03, g, st.pan + (i % 2 ? 0.15 : -0.15)); }
      if (!seen.on && st.u >= 0.52 && st.u < 0.7) { seen.on = true; for (let i = 0; i < 4; i++) gun(t + i * 0.04 + Math.random() * 0.03, g, st.pan + (i % 2 ? 0.15 : -0.15)); }
      stopSeen.set(st.id, seen);
    }
    for (const id of stopSeen.keys()) if (!live.has(id)) stopSeen.delete(id);
  }

  return {
    /** Desde un toque del jugador: crea el AudioContext (o lo reanuda). */
    unlock() {
      if (!AC) return;
      try {
        if (!ctx) { ctx = new AC(); build(); }
        if (ctx.state === "suspended" && want) void ctx.resume().catch(() => {});
      } catch { ctx = null; }
    },
    ready: () => !!ctx,
    frame,
    setPrefs(p: SoundPrefs) { prefs = { ...p }; applyPrefs(); },
    /** Subida del público: adelantamiento (k ≈ 0,5), salida o bandera a cuadros (k = 1). */
    cheer(k: number, dur = 2.5) {
      if (!ctx || !want) return;
      const t = ctx.currentTime;
      if (t < cheerUntil && cheerK >= k) { cheerUntil = Math.max(cheerUntil, t + dur); return; }
      cheerK = k; cheerUntil = t + dur;
    },
    /** Un semáforo que se enciende. */
    light() { if (ctx && want) tone(sfxBus, ctx.currentTime, 0.22, 1046, 0.22, "sine"); },
    /** Se apagan los semáforos: medio segundo de silencio y el rugido de la salida. */
    lightsOut() {
      if (!ctx || !want) return;
      const t = ctx.currentTime;
      silenceUntil = t + 0.45;
      setTimeout(() => this.cheer(1, 4), 450);
    },
    /** Choque: golpe seco y crujido. dist (m) a quien escucha; pan, de -1 a 1. */
    crash(dist = 60, pan = 0) {
      if (!ctx || !want) return;
      const t = ctx.currentTime, g = Math.min(1, 40 / Math.max(20, dist));
      tone(sfxBus, t, 0.35, 90, 0.9 * g, "sine", 38);
      burst(sfxBus, t, 0.25, 0.8 * g, "lowpass", 900, 0.9, pan);
      for (let i = 0; i < 6; i++) burst(sfxBus, t + 0.04 + Math.random() * 0.35, 0.05 + Math.random() * 0.08, 0.35 * g, "highpass", 2500 + Math.random() * 3000, 0.8, pan);
    },
    /** Trueno de un rayo a `km` kilómetros: llega a la velocidad del sonido, más grave y más flojo cuanto más lejos. */
    thunder(km: number) {
      if (!ctx || !want) return;
      const c = ctx, delay = Math.min(14, km / 0.343), g = Math.min(0.9, 1.6 / (1 + km * 0.6));
      setTimeout(() => {
        if (ctx !== c || !want) return;
        const t = c.currentTime;
        // el chasquido (cerca) y el retumbo largo
        if (km < 2.5) burst(sfxBus, t, 0.25, g * 0.8, "highpass", 1500, 0.7);
        tone(sfxBus, t + 0.05, 2.6, 70, g * 0.6, "sine", 35);
        for (let i = 0; i < 7; i++) burst(sfxBus, t + 0.1 + Math.random() * 2.2, 0.6 + Math.random() * 1.2, g * (0.5 - i * 0.05), "lowpass", 180 + Math.random() * 220, 0.8);
      }, delay * 1000);
    },
    /** En 2D, al entrar a boxes uno de tus pilotos: las pistolas, de lejos. */
    pitIn() { if (!ctx || !want) return; const t = ctx.currentTime + 0.4; for (let i = 0; i < 4; i++) gun(t + i * 0.04, 0.25, 0); for (let i = 0; i < 4; i++) gun(t + 1.6 + i * 0.04, 0.25, 0); },
    /**
     * Mensaje de radio: el clic, el ruido de la radio (bajando lo demás mientras suena) y, si está activada y es
     * importante, la voz. Suena aunque la sesión esté en pausa.
     */
    radio(text: string, important: boolean, voice?: { pitch: number; rate: number }) {
      if (!ctx || !prefs.sonido) return;
      const c = ctx;
      if (c.state === "suspended") { void c.resume().catch(() => {}); setTimeout(() => { if (!want && ctx === c && c.state === "running") void c.suspend().catch(() => {}); }, 900); }
      const t = c.currentTime + 0.02;
      tone(radioBus, t, 0.03, 1800, 0.25, "square");
      burst(radioBus, t + 0.02, 0.35, 0.12, "bandpass", 1700, 1.2);
      duck(true); setTimeout(() => { if (!talking) duck(false); }, 450);
      if (important) setTimeout(() => speak(text, "radio", voice), 380);
    },
    /** Un comentario de Lobato, en voz alta si está activado (con su propia voz). */
    lobato(text: string) { speak(text, "lobato"); },
    /** Corta la voz (al ocultar la app). */
    stopVoice() { if (synth && (synth.speaking || synth.pending)) synth.cancel(); },
    /** ¿Hay voces en español en este dispositivo? */
    hasVoice: () => spanishVoices().length > 0,
    /** Sale de la sesión: se apaga y suelta el AudioContext. */
    dispose() {
      want = false;
      if (synth && talking) synth.cancel();
      const c = ctx; ctx = null;
      if (c) void c.close().catch(() => {});
    },
  };
}
