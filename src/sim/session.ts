// Motor de sesión: libres, clasificación (Q y SQ), sprint y carrera.
// Pasos de 0,05 s. Cada coche avanza sobre el perfil de velocidad de referencia, escalado por el
// tiempo que tardaría ÉL en ese minisector con su adherencia, potencia, resistencia y masa de ese
// instante. Aire sucio, rebufo, modo adelantamiento, tapones y adelantamientos salen de las
// distancias reales entre coches.
import { Rng, clamp } from "./rng";
import { caracterOf, type Caracter } from "./caracter";
import { Track, Minisector, msTimeAtGrip, MIN_MASS, REF_CAR } from "./track";
import { type Setup, type SessionSetup, WET_SHIFT, SETUP_Q, SETUP_GRIP } from "./setup";
import { Compound, COMPOUNDS, DRY, HiddenTyre, TyreSet, applyNomination, setGrip, waterGrip, updateSet, axleGrip, warmBlankets, setWear, bestWaterGrip, WET, treadT, blisterT, grainT, driverRough } from "./tyres";
import { WeatherState, stepWeather, rainAt, evaporation, waterStep, windNow } from "./weather";
import { PU_WEAR, puLife, puPowerLoss, puHazard, FAIL_LAPS } from "./powerunit";
import { Plan, planStrategy, aiDecide, aiModes, aiErs, TeamKnowledge, practiceProgram, qualiTick, pickSet, learnFromRun, aiRedFlagTyres, practiceWeather, wrongTyresForWater, teamForecast, ruleSatisfied, NOSE_TIME, qualiCanImprove } from "./strategy";

export const PUSH_NAMES = ["Conservar", "Gestionar", "Normal", "Atacar", "Al límite"];
export const ENGINE_NAMES = ["Ahorro", "Normal", "Potencia"];
export const ERS_NAMES = ["Recargar", "Equilibrado", "Ataque", "Adelantar"];
const PUSH_GRIP = [0.983, 0.992, 1, 1.006, 1.011];
const PUSH_ENERGY = [0.74, 0.87, 1, 1.12, 1.25];
const PUSH_ERR = [0.45, 0.7, 1, 1.7, 2.8];
const PUSH_FUEL = [0.96, 0.98, 1, 1.015, 1.03];
const ENGINE_POWER = [-1.6, 0, 0.9];
const ENGINE_FUEL = [0.93, 1, 1.05];
/** Resistencia extra por apartar agua (% por mm): con pista empapada se pierde velocidad punta. */
const WATER_DRAG = 12;
/** Aire sucio: pérdida máxima de agarre pegado a otro coche, en curvas que dependen de la carga
 * aerodinámica (en una chicane lenta casi no se nota; en una curva rápida, mucho). Se diluye
 * deprisa con la distancia: a 1 s ya es poca y a 1,6 s ninguna. */
const DIRTY_AIR = 0.135;
const dirtyAir = (gap: number) => (gap < 1.6 ? Math.pow(1 - gap / 1.6, 1.5) : 0);
/** Rebufo: % de resistencia que se ahorra detrás de otro coche en recta; dura más que el aire sucio. */
const TOW = 16;
/**
 * Adelantar. En cada frenada se compara la ventaja del que ataca (en segundos por vuelta) con un umbral:
 *  - agarre en aire limpio (neumáticos, coche, piloto, ritmo, daños), que es lo que da tracción y frenada;
 *  - lo que gana en la recta anterior (rebufo, modo adelantamiento, batería, motor), pasado a s/vuelta con PASS_KS;
 *  - ataque del uno contra defensa del otro.
 * Con la ventaja igual al umbral pasa una de cada dos veces; PASS_W dice lo deprisa que sube o baja a partir de ahí.
 * El umbral es el del circuito (`adelantamientos.umbral`, calibrado con su media real de adelantamientos) en su mejor
 * frenada, más PASS_ZONE por lo que le falte a la zona, y PASS_ANY fuera de las zonas (solo se pasa en cualquier curva
 * a un coche mucho más lento). Antes la dificultad del circuito recortaba la probabilidad por arriba y con dos
 * segundos de ventaja se seguía sin pasar: de ahí los trenes.
 */
const PASS_T0 = 1.6;
let PASS_W = 0.3;
export function setPassW(w: number) { PASS_W = w; }
const PASS_KS = 12;
const PASS_ZONE = 1.2;
const PASS_ANY = 2.6;
/** Hueco máximo (s) al llegar a la frenada para poder intentarlo. */
const PASS_REACH = 0.55;
let passTOverride: number | null = null;
/** Para los scripts de calibración: fuerza el umbral de adelantamiento (null: el del circuito). */
export function setPassT(t: number | null) { passTOverride = t; }
const tow = (gap: number) => (gap < 3 ? TOW * Math.exp(-gap * 1.6) : 0);
/** Reglamento: 2 h de carrera, 3 h en total contando las suspensiones. */
const RACE_MAX = 2 * 3600;
/** Agua (mm) con la que la salida se hace tras el coche de seguridad, y con la que se retira. */
const WET_SC_START = 1.35;
const WET_SC_END = 1.15;
const RACE_WINDOW = 3 * 3600;
/** Sprint suspendida y no reanudada por debajo del 75 %: mitad de puntos. */
const SPRINT_HALF = [4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
/** Fracción del agua de la trazada que aparta cada coche al pasar (a ritmo de carrera). */
const CAR_DRY = 0.0035;
const ENGINE_FAIL = [0.6, 1, 2.2];
/**
 * Diferencias entre equipos (agarre y potencia de equipos-2026.json), multiplicadas respecto al mejor: el mejor no
 * cambia (la pole está calibrada con él) y el resto se aleja. Con 1 la parrilla de Q1 cabía en 1,2 s; en 2026 son ~3,3 s
 * (2,0-4,8), con Cadillac y Aston Martin a 2,5-3,5 s del poleman.
 */
const TEAM_SPREAD = 2.6;
/**
 * Ruido de cada vuelta (fracción), aparte del de cada minisector: el de los minisectores se promedia a lo largo de la
 * vuelta y la dejaba en centésimas (σ 0,05 s); en la F1 real, en aire limpio y con el mismo ritmo, 0,2-0,3 s.
 * Se multiplica por lo irregular que es el piloto (1,25 − regularidad/100).
 */
const LAP_NOISE = 0.0065;
/**
 * En la clasificación, el ruido de cada vuelta (el de los minisectores y LAP_NOISE) se multiplica por esto: parte de
 * lo que separa a dos pilotos con el mismo coche no es azar de esa vuelta sino su forma del fin de semana (FORM en
 * weekend.ts), que sigue el domingo. Con las dos cosas, los compañeros quedan a ~0,3 s en clasificación, como en 2026.
 */
const QUALI_NOISE = 0.85;
/**
 * Modo de clasificación del motor y la batería. Solo en las vueltas lanzadas de clasificación se despliega toda la
 * energía; en el resto (carrera, tandas largas, vueltas de salida) se gestiona y la vuelta sale más lenta. La pista
 * está calibrada con la pole, así que esto no acelera la clasificación: frena todo lo demás. Va en tanto por uno del
 * tiempo de vuelta y pesa más donde se va a fondo. En carrera, ~4 % (2026: vuelta rápida / pole ≈ 1,045); en la
 * sprint, menos, porque con poca distancia apenas se gestiona.
 */
const DEPLOY_TRIM: Record<SessionKind, number> = { FP1: 0.04, FP2: 0.04, FP3: 0.04, SQ: 0.04, Q: 0.04, SPRINT: 0.02, RACE: 0.04 };
/** Vueltas lanzadas de libres: sin el modo de clasificación entero y con algo más de combustible. */
const PRACTICE_PUSH_TRIM: Partial<Record<SessionKind, number>> = { FP1: 0.01, FP2: 0.005, FP3: 0.003 };
/**
 * Evolución de la clasificación: al empezar la pista está más verde (aún sin la goma de veinte coches a fondo con
 * blandos) y los pilotos van cogiendo el límite parte a parte. Es lo que le falta a la vuelta al empezar la sesión, en
 * tanto por uno, y baja en línea recta con el reloj de las partes hasta cero al empezar la última salida: la pole
 * (calibrada con la real) no cambia. En 2026 el poleman mejora 0,8-1,7 s de Q1 a Q3. Pesa más en curva que en recta.
 */
const QUALI_EVO: Partial<Record<SessionKind, number>> = { Q: 0.015, SQ: 0.01 };
const QUALI_EVO_END = 180;
/**
 * Goma que deja cada vuelta en libres (en clasificación y carrera, 0,0009). Los libres tienen ahora ~60 vueltas por
 * piloto en vez de ~36, y con la goma de antes la pista llegaba a la clasificación con el tope (la pole salía 0,45 s más
 * rápida que la real con la que está calibrada). Así llega con la misma goma que antes.
 */
const RUBBER_FP_LAP = 0.00054;
/**
 * Neutralizaciones: lo que dura una vuelta con el virtual, con el coche de seguridad y la del que va a por el grupo
 * con él, en veces la vuelta de referencia. Cada circuito tiene un tope de velocidad que da eso: por encima se va a la
 * velocidad del tope y por debajo, como en verde. Así se pierde en recta y casi nada en las curvas lentas, como con el
 * delta del virtual y detrás del coche de seguridad. Antes se iba al 60 % (virtual) o al 50-62 % (coche de
 * seguridad) de la velocidad en todo el circuito, y la vuelta duraba 1,6 y 1,9 veces la verde (real ~1,3 y ~1,4).
 */
// (lo que se pide es algo menos que lo que sale: con el acordeón del grupo y las frenadas, la vuelta medida en el banco
// queda ~0,07 por encima; así sale ~1,33 con el virtual y ~1,42 con el coche de seguridad)
const NEUTRAL_LAP = { vsc: 1.26, sc: 1.35, chase: 1.2 };
/** De los errores en curva, cuántos acaban contra las barreras (en seco). */
const CRASH_P = 0.11;
/**
 * Escapatoria (fase 4): el error acaba contra las barreras más a menudo sin escapatoria (urbanos, muro) y menos con
 * mucha: × (1,5 − escapatoria/26) / RUNOFF_NORM, que de media en los sitios donde se cometen los errores es 1 (así
 * hay los mismos accidentes en total, repartidos según el circuito). En la grava (más de 8 m) el fondo se rompe más a
 * menudo (× 1,5) y sin escapatoria (menos de 3 m), menos (× 0,55): de media, igual.
 */
const RUNOFF_NORM = 1.2;
/** Al salirse de pista: hasta dónde se va por fuera (fracción de la media anchura; 1 es el borde) y cuánto tarda. */
const OFF_WIDE = 1.35, OFF_T = 2.5;
/**
 * Toques (fase 4). La tirada de siempre decide que habrá toque; desde ahí, el que se mete en el sitio del otro (el que
 * ataca o, si cierra la puerta tarde, el que defiende) va hacia él hasta que se tocan de verdad (a lo largo y a lo
 * ancho). Si en TOUCH_T s no llegan a juntarse, se tocan igual. Lo fuerte que es sale de la velocidad con la que se
 * juntan (TOUCH_KL por m/s a lo ancho y TOUCH_KS a lo largo), centrado en TOUCH_MEAN para que el reparto de
 * consecuencias (alerón, pinchazo, largos, accidente) quede de media como antes.
 */
const TOUCH_T = 2.5, TOUCH_KL = 0.12, TOUCH_KS = 0.03, TOUCH_MEAN = 0.4, TOUCH_SHIFT = 0.35;
const CAR_LEN = 5.6, CAR_W = 1.9;
/** Salida (fase 4): a qué distancia del centro va cada fila de la parrilla (fracción de la media anchura). */
const GRID_SIDE = 0.45;
/**
 * Fase 5. Banderas azules: el doblado se aparta de la trazada (BLUE_OFF) y el que dobla sigue casi por ella (BLUE_ON).
 * Boxes: PIT_APPROACH m antes de la entrada, el que va a parar se pone del lado de boxes (PIT_SIDE). Coche de
 * seguridad: en fila, haciendo eses para calentar las gomas (SC_WEAVE de amplitud, cada SC_WEAVE_T s); los doblados
 * que se desdoblan pasan por un lado (UNLAP_SIDE).
 */
const BLUE_OFF = 0.7, BLUE_ON = 0.1, PIT_APPROACH = 300, PIT_SIDE = 0.7, SC_WEAVE = 0.35, SC_WEAVE_T = 3.5, UNLAP_SIDE = 0.6;
/** Probabilidad de pisar fuera de los límites en cada curva rápida de carrera (al ritmo normal). */
const TL_P = 0.0011;
/** Probabilidad de dañar el fondo en un bordillo por cada paso de altura por debajo de lo que pide el circuito. */
const KERB_P = 0.00003;
/** Segundos que necesita el piloto para reaccionar a la orden de parar (si llega más tarde, para en la siguiente). */
const PIT_REACT = 2.5;
/** Parada segura, normal y rápida: segundos de más (o de menos), probabilidad de que salga mal y de salida insegura. */
const PIT_MODE_T = [0.4, 0, -0.25];
const PIT_MODE_P = [0.02, 0.05, 0.09];
const UNSAFE_P = [0, 0.025, 0.08];
export const PIT_MODE_NAMES = ["Segura", "Normal", "Rápida"];
/** Averías que avisan: lo que ve la telemetría. Las que no están aquí rompen de golpe. */
const FAULT_SIGNS: Record<string, string> = {
  motor: "temperatura de agua y aceite muy alta",
  "unidad de potencia": "la unidad de potencia pierde presión de aceite",
  "MGU-K": "el MGU-K se está calentando",
  batería: "la batería se calienta demasiado",
  "caja de cambios": "la caja de cambios pierde presión: los cambios van lentos",
  hidráulica: "la presión hidráulica está bajando",
  frenos: "temperatura de frenos muy alta, el disco se está gastando",
};
/** Lo que avanza una avería por vuelta, y cuánto según el modo de motor (Ahorro, Normal, Potencia) y el ritmo. */
const FAULT_GROW = 0.07;
const FAULT_ENGINE = [0.22, 1, 2];
const FAULT_PUSH = [0.55, 0.75, 1, 1.2, 1.45];
/** Ritmo de más (fracción de agarre) con la confianza a tope (y de menos por los suelos). */
const CONF_PACE = 0.0015;
/** Grados que gana cada compuesto en la vuelta de formación (con 25 °C de asfalto). */
const FORMATION_GAIN: Partial<Record<Compound, number>> = { S: 17, M: 13, H: 9, I: 12, W: 10 };
/** Rivalidades: cuando pelean entre ellos, ninguno levanta (más toques). */
const RIVALS = [["VER", "NOR"], ["VER", "HAM"], ["VER", "RUS"], ["VER", "LEC"], ["NOR", "PIA"], ["ALO", "HAM"], ["LEC", "SAI"], ["GAS", "OCO"], ["STR", "ALO"]];
const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const rivals = (a: Car, b: Car) => RIVALS.some(([x, y]) => (a.d.abrev === x && b.d.abrev === y) || (a.d.abrev === y && b.d.abrev === x));
/**
 * Posición lateral (fase 1): a cuántos metros del de delante se aparta uno (1,3 coches), cuánto (fracción de la media
 * anchura) se aparta él y cuánto cede el de delante, lo deprisa que se mueve (s) y hasta dónde puede llegar.
 */
const LAT_CLOSE = 5.6 * 1.3, LAT_SIDE = 0.4, LAT_YIELD = 0.3, LAT_TAU = 0.7, LAT_MAX = 0.82;
/** Segundos de antelación con los que se aparta según lo deprisa que se acerca, y lo deprisa que se mueve si va pegado. */
const LAT_LOOK = 0.8, LAT_TAU_QUICK = 0.25;
/**
 * Estela del de delante según el lado (fase 2): a cuántos metros de su eje queda e^-1 del aire sucio (WAKE_DIRTY) y del
 * rebufo (WAKE_TOW, que es más ancho). Justo detrás se lleva todo; a un coche de lado, bastante menos.
 */
const WAKE_DIRTY = 3.5, WAKE_TOW = 4.5;
const wake = (dl: number, w: number) => Math.exp(-((dl / w) ** 2));
/**
 * Fuera de la trazada: fracción de agarre que se pierde en una curva (con su sensibilidad al agarre) yendo por el borde
 * de la pista, en lugar de por la trazada; crece con el cuadrado de lo que se aparta. Con la pista engomada pesa más
 * (fuera de la trazada no hay goma y sí gravilla de neumático).
 */
const OFFLINE_GRIP = 0.035;
/**
 * Respirar aire limpio: el que va a menos de BREATHE_GAP s de otro, al llegar a una curva rápida que depende de la carga
 * (aero · sensibilidad al agarre > BREATHE_MIN, unos 50 m por delante), se abre LAT_BREATHE (fracción de la media
 * anchura) hacia el centro de la pista. Pierde algo de trazada y gana aire.
 */
const BREATHE_GAP = 1.0, BREATHE_MIN = 0.25, LAT_BREATHE = 0.25, BREATHE_AHEAD = 50;
/**
 * Lo que se rebaja el umbral de adelantamiento de cada circuito (s/vuelta) para que, con la estela según el lado y el
 * coste de salirse de la trazada, se adelante lo mismo que antes (sin esto, un ~4,5 % menos: realismo.ts, semillas 1 y
 * 101, 400 carreras).
 */
const PASS_LAT = 0.05;
/**
 * Adelantar como maniobra (fase 3). El que ataca se pone a un lado (MV_SIDE, fracción de la media anchura): por el
 * interior de la curva o, si el de delante le cierra el interior, por fuera. El de delante se aparta un poco hacia el
 * otro lado (MV_YIELD) o tapa el interior (MV_COVER). Si el intento no sale, a los MV_FAIL_T s el que ataca vuelve
 * detrás; la maniobra se da por acabada a los MV_MAX_T s o cuando uno le saca MV_CLEAR m al otro.
 */
const MV_SIDE = 0.55, MV_YIELD = 0.3, MV_COVER = 0.5, MV_FAIL_T = 1.4, MV_MAX_T = 6, MV_CLEAR = 9;
/** Lo deprisa que pierde su tiempo (fracción de la velocidad) el que está siendo adelantado: el resto, 0,6. */
const MV_DELAY_RATE = 0.1;
/** Segundos rueda con rueda a partir de los que se cuenta en la radio y en la tele. */
const PARALLEL_T = 1.0;
/**
 * Un solo cambio de dirección al defender. El que tapa el interior a veces se mueve otra vez, hacia el lado por donde
 * va el otro, con él ya casi al lado: «moverse en la frenada». Pasa con probabilidad MOVE2_P (más con un piloto
 * agresivo y × MOVE2_HARD en duro), MOVE2_AT s después de tapar el interior. El que ataca levanta (pierde MOVE2_LIFT s)
 * y los comisarios lo investigan: sanción de 5 s en MOVE2_PEN de los casos; si no, advertencia.
 */
/**
 * Trazada de mojado. Con agua, la goma de la trazada de seco resbala más que el asfalto de al lado: la buena se aparta
 * del vértice. Entre WET_LINE_W0 y WET_LINE_W1 mm de agua la trazada pasa de la de seco a la de seco × (1 −
 * WET_LINE_SHIFT): con la pista empapada, algo por fuera del vértice (donde la de seco iba por dentro). Lo que cuesta
 * salirse de la trazada se mide contra esta (en mojado, ir por la goma de la de seco es lo que cuesta).
 */
const WET_LINE_W0 = 0.3, WET_LINE_W1 = 1.0, WET_LINE_SHIFT = 1.4;
const MOVE2_P = 0.06, MOVE2_HARD = 2.5, MOVE2_AT = 0.35, MOVE2_TO = 0.15, MOVE2_LIFT = 0.3, MOVE2_PEN = 0.45;
/**
 * «Duro» en la pista. El que ataca en duro se pone más pegado al otro (MV_SIDE_HARD en lugar de MV_SIDE); el que
 * defiende en duro cede menos sitio (MV_YIELD_HARD) o, si tapa el interior, lo tapa más tarde (COVER_LATE s después)
 * y más cerrado (MV_COVER_HARD). Con dos coches en paralelo a menos de SQUEEZE_GAP m (de centro a centro) pueden
 * rozarse (si alguno va en duro y pasados SQUEEZE_AFTER s): SQUEEZE_K toques por segundo con los coches juntos del todo, menos cuanto más hueco. De ahí salen los
 * toques de más del duro (antes eran un × 1,8 a ojo).
 */
const MV_SIDE_HARD = 0.3, MV_YIELD_HARD = 0.15, MV_COVER_HARD = 0.62, COVER_LATE = 0.3, SQUEEZE_GAP = 2.9, SQUEEZE_K = 0.28, SQUEEZE_AFTER = 0.6;
/** Ventaja de más (s/vuelta) que necesita el que ataca si el de delante cierra la puerta. */
const DEFEND_T = 0.35;
/**
 * Riesgo en la pelea (orden del muro, solo tus pilotos; la IA y el automático van siempre en limpio). En duro:
 *  - atacando, frena más tarde y se tira con menos hueco: RISK_ADV s/vuelta más de ventaja y vuelve a intentarlo antes
 *    (RISK_RETRY s en vez de 6);
 *  - defendiendo, cierra más tarde y cede menos: el que ataca necesita RISK_DEF s/vuelta más;
 *  - a cambio, en la pista va más pegado al otro (ver MV_SIDE_HARD y SQUEEZE_K: de ahí salen más toques), se pasa de frenada más a
 *    menudo y, si hay toque, los comisarios le echan la culpa más a menudo (RISK_BLAME).
 */
const RISK_ADV = 0.15, RISK_DEF = 0.12, RISK_RETRY = 4, RISK_BLAME = 0.12;
export const RISK_NAMES = ["Limpio", "Duro"];
// Moral (temporada, 0 a 100; 60 es lo normal): un poco de ritmo arriba o abajo, y con ella baja algunos no obedecen.
const MORAL_PACE = 0.0012; // agarre por cada 40 puntos de moral sobre 60
// cuánto le cuesta obedecer con la moral por los suelos, según su carácter
const DISOBEY_K: Record<Caracter, number> = { volcanico: 1, quejica: 0.65, socarron: 0.45, cerebral: 0.25, novato: 0.15, autocritico: 0.1, calmado: 0.08 };
// rivalidad de temporada (0 a 1): defienden más contra el rival y se tocan más
const RIVAL_DEF = 0.18, RIVAL_CONTACT = 0.8;
// banderas azules ignoradas: probabilidad por cada vez que doblan a un coche (antes de su carácter)
const BLUE_IGNORE_P = 0.02;

type IncidentKind = "crash" | "failure" | "debris";
const ERS_POWER = [-3.5, 0, 2.0, 4.5];
const ERS_NET = [1.1, 0, -0.9, -2.4];
export const SOC_MAX = 4;
const MO_POWER = 6; // % extra del modo adelantamiento (2026) o del DRS (2011-2025)

/**
 * Reglamento de la época (modo escenario: carreras reales de 2010 en adelante). Sin él, el de 2026.
 *  - ayuda: cómo se adelanta en recta: modo adelantamiento (2026), DRS (2011-2025, el mismo segundo en el punto de
 *    detección) o nada (2010);
 *  - ers: lo que pesa la parte eléctrica en la potencia: 1 en 2026, ~0,45 con los híbridos de 2014-2025, ~0,12 con el
 *    KERS de 2011-2013 y 0 sin batería (2010);
 *  - vsc: hay coche de seguridad virtual (desde 2015).
 */
export interface Era { ayuda: "mo" | "drs" | "ninguna"; ers: number; vsc: boolean }
export const ERA_2026: Era = { ayuda: "mo", ers: 1, vsc: true };
/** Reglamento de una temporada (de 2010 en adelante). */
export function eraOf(year: number): Era {
  if (year >= 2026) return ERA_2026;
  if (year >= 2014) return { ayuda: "drs", ers: 0.45, vsc: year >= 2015 };
  if (year >= 2011) return { ayuda: "drs", ers: 0.12, vsc: false };
  return { ayuda: "ninguna", ers: 0, vsc: false };
}

export type SessionKind = "FP1" | "FP2" | "FP3" | "SQ" | "Q" | "SPRINT" | "RACE";
export const SESSION_NAMES: Record<SessionKind, string> = {
  FP1: "Libres 1", FP2: "Libres 2", FP3: "Libres 3", SQ: "Clasificación sprint", Q: "Clasificación", SPRINT: "Sprint", RACE: "Carrera",
};
export const isRaceKind = (k: SessionKind) => k === "RACE" || k === "SPRINT";
export const isQualiKind = (k: SessionKind) => k === "Q" || k === "SQ";

export interface QPart { name: string; minutes: number; advance: number | null; compound?: Compound }
export const Q_PARTS: QPart[] = [
  { name: "Q1", minutes: 18, advance: 16 },
  { name: "Q2", minutes: 15, advance: 10 },
  { name: "Q3", minutes: 12, advance: null },
];
/** Con más de 22 coches (modo «crear equipo»: 24) caen más en la primera parte; a la última pasan 10. */
function partsFor(base: QPart[], n: number): QPart[] {
  if (n === 22) return base;
  return base.map((p, i) => (i === 0 ? { ...p, advance: Math.min(n, 10 + Math.floor((n - 10) / 2)) } : p));
}
export const SQ_PARTS: QPart[] = [
  { name: "SQ1", minutes: 12, advance: 16, compound: "M" },
  { name: "SQ2", minutes: 10, advance: 10, compound: "M" },
  { name: "SQ3", minutes: 8, advance: null, compound: "S" },
];
const Q_BREAKS = [7, 8];
const SQ_BREAKS = [7, 5];

export interface TeamDef {
  id: string; nombre: string; motor: string; color: string;
  agarre: number; potencia: number; resistencia: number; desgaste: number;
  /** Lo que gana (+) o pierde (−) el coche sobre su agarre en curva lenta, media y rápida (mismas unidades). */
  curvas?: [number, number, number];
  boxes: number; fiabilidad: number; estrategia: number; meteo: number;
  pilotos: DriverDef[];
  /** Consumo de combustible frente al de referencia (1); lo baja el desarrollo del motor (development.ts). */
  consumo?: number;
  /** Decoración del coche (solo dibujo, equipo propio): dibujo, segundo color y tres patrocinadores (índices de marca). */
  librea?: Librea;
}
export interface Librea { estilo: string; color2: string; marcas: number[] }
export interface DriverDef {
  nombre: string; abrev: string; numero: number;
  ritmo: number; regularidad: number; neumaticos: number; lluvia: number;
  ataque: number; defensa: number; agresividad: number; salida: number;
  /** Año de nacimiento y de su primera carrera de F1 (sin él, nunca ha corrido un gran premio: novato). */
  nacimiento?: number; debut?: number;
  /** Categoría en la que corre si no está en la F1 (p. ej. «F2»). */
  serie?: string;
}

/**
 * Estado de los neumáticos según el piloto y los ingenieros (por eje, delantero y trasero).
 * grain: graining que nota el piloto (0 nada, 1 leve, 2 moderado, 3 fuerte).
 * blister: 0 nada, 1 el piloto nota vibraciones (sospecha), 2 confirmadas por los ingenieros.
 * risk: la telemetría ve la banda pasada de temperatura (riesgo de ampollas).
 */
export interface TyreFeel { set: string; grain: [number, number]; blister: [number, number]; risk: [boolean, boolean]; hotLaps?: [number, number]; warned?: [boolean, boolean] }
export const GRAIN_WORDS = ["", "leve", "moderado", "fuerte"];

/** Lo que dura todo el fin de semana: juegos de neumáticos y lo que sabe el equipo. */
export interface Entrant {
  id: number;
  d: DriverDef;
  team: TeamDef;
  player: boolean;
  sets: TyreSet[];
  knowledge: TeamKnowledge;
  /** Modo «crear equipo»: kilómetros que lleva la unidad de potencia montada al empezar la sesión. */
  pu?: { km0: number };
  /** Forma del piloto este fin de semana (fracción de agarre, ver FORM en weekend.ts); sin ella, 0. */
  form?: number;
}

export type Loc = "garage" | "lane_out" | "track" | "lane_in" | "pit" | "out" | "fin";
export type RunPhase = "out" | "push" | "cool" | "in" | "long";
export interface Run {
  kind: "inst" | "qsim" | "long" | "quali";
  setId: string;
  pushLaps: number; // vueltas lanzadas (qsim/quali) o de tanda (long)
  fuel: number; // kg
  at?: number; // segundos de sesión a los que sale (programa)
}

export interface Car {
  id: number;
  e: Entrant;
  d: DriverDef;
  team: TeamDef;
  player: boolean;
  loc: Loc;
  s: number;
  gridS: number;
  v: number;
  retireReason?: string;
  tyres: TyreSet | null;
  usedCompounds: Set<Compound>;
  stops: number;
  fuel: number;
  soc: number;
  /** Batería media reciente (la instantánea sube y baja en cada recta y cada frenada). */
  socAvg?: number;
  push: number;
  engine: number;
  ers: number;
  pitRequest: string | null; // id del juego a montar
  pit?: { noseChange: boolean; t: number; total: number; entryS: number; dist: number; stationary: number; setId: string; changed: boolean; pen?: number };
  lane?: { t: number; total: number }; // calle de boxes en libres/clasificación
  wing: number;
  floor: number;
  delay: number;
  /** Solo para dibujar (mapa 3D): el último percance y cuándo fue (segundos de sesión). No cambia nada de la carrera. */
  fx?: { k: "spin" | "off" | "lock" | "crash"; t: number; loss?: number };
  msK: number;
  /**
   * Posición lateral (plan lateral, fase 1): metros desde el centro de la pista (positivo a la derecha en el sentido de
   * la marcha). Sale de la trazada y de `latOff`, lo que se aparta de ella. Por ahora no cambia nada de la carrera: es
   * lo que dibuja el 3D. Fuera de la pista (boxes, garaje) no significa nada.
   */
  lat?: number;
  /** Lo que se aparta de la trazada, como fracción de la media anchura (se acerca poco a poco a `latWant`). */
  latOff?: number;
  /** Adónde quiere apartarse ahora (fracción de la media anchura): lo decide `lateral()` en cada paso. */
  latWant?: number;
  /** Pegado a otro en este paso: se aparta más deprisa. */
  latQuick?: boolean;
  /** Separación lateral (m) con el de delante (`aheadId`): lo que se sale de su estela. */
  aheadDl?: number;
  /** Lo que va fuera de la trazada, como fracción de la media anchura: cuesta agarre en curva. */
  offLine?: number;
  /**
   * Adelantamiento en marcha (lo lleva el que ataca): a quién, por qué lado (+1 derecha), si va por fuera, si sale
   * (`pass`), si el otro le cierra el interior (`cover`) y cuándo empezó.
   */
  maneuver?: { a: number; side: number; outside: boolean; pass: boolean; cover: boolean; t0: number; touch?: { byDef: boolean }; blue?: boolean; sbs?: number; said?: boolean; weave?: boolean; weaved?: boolean };
  /** Metido en una maniobra en este paso (como atacante o como defensor): no se aparta por su cuenta. */
  inMv?: boolean;
  /** Le están adelantando en una maniobra (el tiempo que pierde se reparte más). */
  passedIn?: boolean;
  /** Se ha salido de pista: hacia qué lado (+1 derecha) se va largo y hasta cuándo. */
  offWide?: { side: number; until: number };
  /** Velocidad lateral (m/s, positivo a la derecha). */
  latV?: number;
  /** Lado de su casilla en la parrilla (+1 derecha). */
  gridSide?: number;
  cross: number[];
  lapTimes: number[];
  lapStart: number;
  best: number; // mejor vuelta válida de la sesión (o de la parte en curso)
  bestByPart: number[];
  /** Evolución de la pista que faltaba cuando hizo su mejor vuelta de la parte (ver Session.qualiEvoGain). */
  bestEvo?: { part: number; evo: number; wear: number };
  lapValid: boolean;
  noise: number;
  /** Lo que va de más o de menos en esta vuelta (ver LAP_NOISE). */
  lapNoise?: number;
  followGap: number;
  aheadId: number;
  drs: boolean; // modo adelantamiento activo (MO)
  drsEligible: boolean;
  grant: number;
  grantUntil: number;
  finishT: number;
  plan: Plan;
  lastPitLap: number;
  pace: number;
  /** Ritmo en curva lenta, media y rápida (pace es su media en este circuito, para las estimaciones). */
  paceBand: [number, number, number];
  wearMult: number;
  slowPuncture: boolean;
  autoPush: boolean;
  autoErs: boolean;
  auto: boolean; // en libres/clasificación: la IA lleva el programa
  wetWarned?: boolean; // ya se avisó al jugador de que va con el neumático equivocado
  cliffWarned?: string; // id del juego del que ya se avisó que se acaba
  /** Segundos de la vuelta en curso con la banda por encima de la temperatura de ampollas (del., tras.): lo ve la telemetría. */
  tyreHeat?: [number, number];
  /** Lo que el equipo sabe del juego montado: nadie ve el graining ni las ampollas, solo lo que nota el piloto y la telemetría. */
  tyreFeel?: TyreFeel;
  gapWant: number; // hueco que busca con el de delante en la vuelta de salida (s)
  letPass?: number;
  advice?: { lap: number; setId: string };
  // libres / clasificación
  run?: Run & { phase: RunPhase; done: number; startT: number; lapsData: number[] };
  queue: Run[];
  eliminated: boolean;
  elimPart?: number;
  qPlan?: { part: number; deps: number[]; urgentAt?: number; banker?: boolean };
  sessionLaps: number;
  pitWhy?: string;
  stintW0: number; // desgaste del juego al montarlo
  stintL0: number; // vueltas que llevaba
  learnedLap: number;
  lastImpede: number; // id del último coche lento con el que se ha cruzado en vuelta rápida
  secCur: number[]; // sectores de la vuelta en curso
  secLast: number[]; // sectores de la última vuelta
  secBest: number[]; // mejores sectores personales
  lastLapValid: boolean;
  passLog?: { a: number; until: number; outside?: boolean }; // adelantamiento en curso (se anuncia al completarse)
  passedBy?: { id: number; t: number }; // quién le acaba de pasar: sin inercia para devolvérsela en la siguiente frenada
  bestTyre?: Compound; // neumático de la mejor vuelta
  bestTyreByPart: Compound[]; // en clasificación, por parte
  bestSecs: number[]; // sectores de su mejor vuelta (para comparar parciales)
  bestSecsByPart: number[][]; // en clasificación, por parte
  bestWaterByPart: number[]; // en clasificación, agua media en pista durante su mejor vuelta de cada parte
  lapW0?: number; // libres / clasificación: agua media en pista al empezar la vuelta en curso
  stintLog: { c: Compound; from: number; used: boolean }[]; // carrera: neumáticos montados y desde qué vuelta
  puKm: number; // km de desgaste que suma a su unidad de potencia en esta sesión (ponderados por el modo de motor)
  puBroken?: boolean; // la unidad de potencia se ha roto
  setup?: Setup; // reglaje (carga y altura, -2 … 2); sin él, el coche de referencia de siempre
  /** Salida: tiempo de reacción (s) y aceleración frente a la normal (1). */
  launch?: { react: number; k: number };
  /** Hueco (s) con el que le sigue el de detrás ahora mismo (99: nadie): presión. */
  chased?: number;
  /** Vueltas seguidas cruzando la meta a menos de 1 s del mismo coche sin poder pasarle. */
  stuck?: { id: number; n: number };
  /** Carrera: cuándo falló su último intento de adelantar (para no repetir el aviso ni el castigo en cada curva). */
  lastTry?: number;
  /** Por qué recomienda parar el estratega (solo para el mensaje al jugador). */
  adviceWhy?: string;
  /** Cuándo salió de boxes por última vez (s de sesión). */
  pitOutT?: number;
  /** La IA se ha descolgado a propósito para enfriar neumáticos: hasta qué vuelta. */
  coolUntil?: number;
  /** Lo que tenía elegido el jugador antes de que la pelea subiera motor y ritmo (se devuelve al acabarla). */
  fightBoost?: { engine: number; push: number; setEngine: number; setPush: number };
  /** Coche de seguridad: doblado que tiene permiso para desdoblarse (adelanta al grupo y da la vuelta hasta la cola). */
  unlap?: boolean;
  /** Relanzada: cuándo (s de sesión) puede acelerar, al ver acelerar a los de delante. */
  scGoT?: number;
  /** Sanción de tiempo pendiente (s): se cumple parado en la próxima parada o se suma al tiempo final. */
  penS?: number;
  /** Segundos de sanción sumados al tiempo final. */
  penAdded?: number;
  /** Veces que se ha salido de los límites de pista en carrera. */
  tlStrikes?: number;
  /** Morro en la próxima parada: auto (el equipo hace la cuenta), cambiarlo o dejarlo. */
  nose?: "auto" | "yes" | "no";
  /** Cómo se defiende del que le ataca: auto (lo decide el equipo), defender (cierra la puerta) o no pelear. */
  fight?: "auto" | "defend" | "yield";
  /** Riesgo en la pelea: limpio (lo normal) o duro (más eficaz, pero más toques y más sanciones). Solo tus pilotos. */
  risk?: "limpio" | "duro";
  /** Parada: 0 segura, 1 normal, 2 rápida (más corta, pero con más riesgo de que salga mal o de salida insegura). */
  pitMode?: number;
  /** Cuándo se pidió la parada que tiene pendiente (s de sesión): el piloto necesita unos segundos para reaccionar. */
  pitCallT?: number;
  /** Confianza del piloto en esta sesión (−1 a 1): sube con las vueltas limpias y los adelantamientos, cae tras un error. */
  conf?: number;
  /** Moral en la temporada (0 a 100); sin ella, la de siempre. */
  moral?: number;
  /** Ya se ha negado una vez a parar con la parada que tiene pedida: a la siguiente entra. */
  pitHold?: boolean;
  /** Banderas azules: el coche que le está doblando ahora y hasta cuándo no se aparta (si las ignora). */
  blueFor?: number;
  blueHold?: number;
  /** Avería que se está gestando: qué es, lo cerca que está de romperse (0 a 1) y si es de la unidad de potencia. */
  fault?: { what: string; lvl: number; pu: boolean; warned: number };
}

export type FlagState = "green" | "vsc" | "sc" | "sc_in" | "red";

export interface RaceEvent {
  t: number;
  lap: number;
  text: string;
  kind: "radio" | "control" | "pit" | "info" | "weather" | "incident";
  carId?: number;
  pause?: boolean;
  important?: boolean;
  /** Qué ha pasado, para quien reaccione al mensaje (la radio de los pilotos) sin leer el texto. */
  code?: EventCode;
  /** El otro coche del suceso (a quién adelanta, con quién se toca, quién estorba). */
  other?: number;
  /** Una cifra del suceso: la posición o los segundos de la parada. */
  n?: number;
  /** Lo ha puesto la interfaz (la voz de un piloto), no la simulación. */
  voz?: boolean;
  /** Radio mítica: lo que se dijo de verdad y dónde. */
  mitica?: string;
  /** Por qué es la sanción (code "sancion"). */
  motivo?: "toque" | "limites" | "pitlane" | "insegura" | "azules" | "frenada";
  /** Adelantamiento (code "adelanta"): por dónde. */
  lado?: "dentro" | "fuera";
  /** Toque o sanción por toque: id del coche que cerró la puerta tarde (si no está, se metió el que atacaba). */
  cierra?: number;
}

/** Sucesos con código (ver RaceEvent.code). */
export type EventCode = "fondo" | "limites" | "abandono" | "pinchazo" | "tarde" | "amarilla" | "meta" | "gomas" | "estratega"
  | "agua" | "aguaPregunta" | "vuelta" | "eliminado" | "trompo" | "salida" | "plano" | "toque" | "alerón" | "trafico" | "adelanta"
  | "parada" | "sale" | "pole"
  // dirección de carrera y meteo (para Lobato)
  | "vsc" | "sc" | "roja" | "verde" | "cuadros" | "empieza" | "eliminados" | "sancion" | "sinSancion" | "blancaNegra"
  | "desdoblar" | "liderAcelera" | "salidaParada" | "banderaAmarilla" | "descalificado" | "anulada" | "lluvia" | "seca" | "boxes"
  // el piloto no obedece al muro (n: 0 no deja pasar, 1 retrasa la parada)
  | "desobedece"
  // un doblado no hace caso a las banderas azules (other: el que le dobla)
  | "azules"
  // posición lateral (plan lateral, fase 6): dos coches rueda con rueda (carId el que ataca, other el otro, n la
  // posición en juego) y el de delante que tapa el interior (carId el que defiende, other el que ataca)
  | "paralelo" | "cierra"
  // se mueve otra vez en la frenada (carId el que defiende, other el que ataca)
  | "frenada";

export interface SessionOptions {
  kind: SessionKind;
  seed: number;
  track: Track;
  entrants: Entrant[];
  hidden: HiddenTyre;
  weather: WeatherState;
  water: number[];
  waterOff?: number[]; // fuera de la trazada (si no se da, igual que la trazada)
  rubber: number;
  grid?: number[]; // ids de inscritos en orden de parrilla (carreras)
  minutes?: number; // libres
  laps?: number; // carreras
  sprintWeekend: boolean;
  restore?: boolean; // se va a volcar una instantánea encima: sin preparar parrilla ni programas
  setup?: SessionSetup; // reglajes (ver setup.ts); sin ellos, todos con el coche de referencia
  year?: number; // temporada (para saber quién es novato); sin ella, 2026
  era?: Era; // reglamento (modo escenario); sin él, el de 2026
  /** Moral de cada coche en la temporada (0 a 100). Sin ella (fin de semana suelto, pruebas), nada cambia. */
  moral?: Record<number, number>;
  /** Rivalidades de la temporada: [coche, coche, intensidad de 0 a 1]. */
  rivals?: [number, number, number][];
}

/** Una tanda larga de libres, resumida: ritmo medio sin combustible y caída por vuelta. */
export interface LongRun { id: number; c: Compound; n: number; avg: number; deg: number; wet: boolean }

export interface ResultRow {
  id: number;
  pos: number;
  best: number;
  time: number; // carreras: tiempo total
  laps: number;
  status: "fin" | "out" | "dns" | "dsq" | "ok";
  reason?: string;
  stops: number;
  part?: string; // clasificación: en qué parte quedó
  grid?: number; // carreras: posición de salida
  pen?: number; // carreras: segundos de sanción sumados al tiempo final
}

export class Session {
  kind: SessionKind;
  t = 0; // segundos de sesión (no avanza con bandera roja en clasificación)
  wall = 0; // segundos reales simulados (incluye pausas)
  dt = 0.05;
  track: Track;
  cars: Car[] = [];
  rng: Rng;
  weather: WeatherState;
  water: Float64Array; // agua en la trazada (mm por minisector): la secan los coches
  waterOff: Float64Array; // agua fuera de la trazada: solo drenaje y evaporación
  rubber: number;
  flag: FlagState = "green";
  flagTimer = 0;
  scLapsLeft = 0;
  scWet = false; // coche de seguridad por agua: no se retira hasta que se pueda correr
  /** Ya se ha dado la orden de desdoblarse en este coche de seguridad (y cuántas vueltas de más se les ha esperado). */
  unlapCalled = false;
  unlapWait = 0;
  /** Relanzada: a cuántos metros de la meta acelera el líder y cuándo lo ha hecho (s de sesión). */
  scGo: { at: number; t: number | null } | null = null;
  /** Toques que investigan los comisarios: cuándo deciden, quién atacaba, a quién, lo grave que fue y si era la salida. */
  probes: { at: number; c: number; a: number; sev: number; lap1: boolean; byDef?: boolean; move?: boolean }[] = [];
  /** Banderas amarillas por zona: minisector, hasta cuándo (s de sesión) y si es doble. */
  yellows: { ms: number; until: number; double: boolean }[] = [];
  /** Salida parada tras una bandera roja: la parrilla espera los semáforos, y cuándo se apagaron (s de sesión). */
  restartHold = false;
  launchT = 0;
  drsEnabledFromLap = 3;
  events: RaceEvent[] = [];
  hidden: HiddenTyre;
  finished = false;
  chequered = false;
  /** Segundos que lleva la parrilla esperando a que se apaguen los semáforos (solo carreras con salida parada). */
  startHold = 0;
  /** Cuánto dura la secuencia: 5 s de luces y una espera de 0,4 a 2,6 s que cambia de una carrera a otra (sin azar). */
  startHoldMax() { return 5.4 + ((this.laps * 37 + this.N * 11) % 23) / 10; }
  /** Semáforos encendidos ahora mismo (0 a 5): se encienden en la parrilla y se apagan todos a la vez en la salida. */
  startLights() {
    if (!isRaceKind(this.kind) || (this.t > 0 && !this.restartHold) || this.flag !== "green" || this.startHold >= this.startHoldMax()) return 0;
    return Math.min(5, Math.floor(this.startHold + 1e-6));
  }
  leaderLap = 0;
  lapRefRace: number;
  secPerGrip: number;
  N: number;
  fuelPerLap: number;
  laps: number;
  durationS: number; // libres: duración; clasificación: duración de la parte
  parts: QPart[] = [];
  breaks: number[] = [];
  part = 0;
  partT = 0; // tiempo transcurrido en la parte
  inBreak = 0; // segundos de descanso entre partes
  sprintWeekend: boolean;
  leaderId = -1;
  secStart: number[]; // primer minisector de cada sector
  secBest = [Infinity, Infinity, Infinity]; // mejores sectores de la sesión
  bestLap = Infinity;
  longRuns: LongRun[] = []; // tandas largas de los libres
  autoPlayers = false; // carrera simulada hasta el final: la IA decide también por el jugador
  /** Tus pilotos, en plena pelea (a menos de 0,7 s), suben solos el motor y el ritmo como hace la IA (Ajustes). */
  autoFight = true;
  passCount = 0; // adelantamientos completados en pista (sin contar doblados ni los de boxes)
  passLap1 = 0; // de ellos, los de la primera vuelta
  /** Recuento de lo que ha pasado (solo para medir: scripts/realismo.ts). No cambia nada de la sesión. */
  stats = { sc: 0, vsc: 0, red: 0, contacts: 0, offs: 0, retire: 0, pens: 0, passIn: 0, passOut: 0, sideBySide: 0, overlap: 0, touchGeo: 0, touchSev: 0, touchStart: 0, move2: 0, squeeze: 0 };
  /** Rivalidades de la temporada por pareja («id-id», el menor primero): intensidad de 0 a 1. */
  rivalK: Record<string, number> = {};
  /** Lo que ha pasado entre cada pareja en esta sesión (para las rivalidades de la temporada): toques y adelantamientos. */
  duels: Record<string, { touch: number; passes: number }> = {};
  /** Órdenes del jugador en carrera y si las ha cumplido (para la moral de la temporada). */
  orders: { carId: number; kind: "dejarPasar" | "box"; mate?: number; obeyed: boolean }[] = [];
  /** Estado del azar de la moral: aparte del de la sesión, para no mover nada cuando no hay órdenes. */
  moodS = 1;
  /** Estado del azar de las banderas azules ignoradas (aparte, para que sin ellas la carrera sea la misma). */
  blueS = 1;
  /** Azar propio de los dobles movimientos en la frenada (así no mueven el azar del resto de la carrera). */
  moveS = 1;
  /** Tras una bandera roja por lluvia: cuando se retire el coche de seguridad, salida parada (si la pista lo permite). */
  standAfterSc = false;
  /** Ventaja (s/vuelta) con la que se adelanta una de cada dos veces en la mejor frenada del circuito. */
  get passT(): number { return passTOverride ?? this.track.def.adelantamientos?.umbral ?? PASS_T0; }
  /** Lo difícil que es adelantar aquí: la ventaja (s/vuelta) que hace falta en la mejor frenada que tenga el circuito. */
  get passHard(): number {
    let z = 0;
    for (const m of this.track.ms) z = Math.max(z, m.overtake);
    return this.passT + (z > 0 ? (1 - z) * PASS_ZONE : PASS_ANY);
  }
  /** Lo que cuesta, en segundos, volver de una parada entre coches más lentos: más donde no se puede pasar. */
  get trafficCost(): number { return 1 + 1.7 * this.passHard; }
  lapOrder: number[][] = []; // carrera: orden (ids) al cerrar cada vuelta el líder; [0] = parrilla
  /** Hueco que se busca en la vuelta de salida (s): rebufo en circuitos de rectas, aire limpio en el resto. */
  outLapGap = 2.5;
  towTrack = false;
  private lastPitExit = -99;
  redReason: "rain" | "crash" | null = null;
  redWall = 0; // cuándo empezó la bandera roja (tiempo real simulado)
  redLap = 0; // vuelta en la que se suspendió (la que iba haciendo el líder)
  suspended = 0; // tiempo total con la carrera suspendida (s)
  greenLeaderLaps = 0; // vueltas que el líder ha completado con bandera verde
  /** Carrera suspendida y no reanudada: vueltas que cuentan para la clasificación. */
  shortened: { laps: number; order: number[]; fin: number[] } | null = null;
  onEvent?: (e: RaceEvent) => void;
  private weatherAcc = 0;
  private lastRainMsg = -999;
  private wasRaining = false;
  private tRef: number[];
  /** Topes de velocidad (m/s, en la escala de vref) del virtual y del coche de seguridad en este circuito (ver NEUTRAL_LAP). */
  neutralCap!: { vsc: number; sc: number; chase: number };
  private trimW: number[];
  /** El mejor agarre y la mejor potencia de la parrilla: la referencia de TEAM_SPREAD. */
  private topTeam = { agarre: 0, potencia: 0 };
  /** Lo que pesa en este circuito cada tipo de curva (lenta, media, rápida) en lo que depende del agarre. */
  private bandShare: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];
  private cornerW: number[];
  private estimating = false;
  /** Energía recuperada por vuelta (MJ) y cómo se reparten la recarga y el gasto entre los minisectores. */
  ersLap = 6;
  private ersIn: number[] = [];
  private ersOut: number[] = [];
  /** Reglajes: lo que no cambia en la sesión (ver setup.ts y setupAt). */
  private setupK: { opt: Setup; dragPerA: number; aeroMean: number; lapRef: number; mean: { wk: number; v: number }[] } | null = null;

  /** Reglamento de la época: DRS o modo adelantamiento, KERS o batería, coche de seguridad virtual. */
  era: Era;
  /** Modo escenario: lo que pasa cuando el líder cierra una vuelta (por ejemplo, un coche de seguridad de la carrera real). */
  onLap: ((lap: number) => void)[] = [];
  /** Modo escenario: lo que pasa a un tiempo dado de la sesión (s), a mitad de vuelta. */
  timers: { t: number; fn: () => void }[] = [];
  /** Nombre corto de la ayuda para adelantar («MO», «DRS») o null si no hay. */
  get aidShort(): string | null { return this.era.ayuda === "mo" ? "MO" : this.era.ayuda === "drs" ? "DRS" : null; }
  /** Nombre de la parte eléctrica («Batería», «KERS») o null si no hay (2010). */
  get ersLabel(): string | null { return this.era.ers <= 0 ? null : this.era.ers < 0.3 ? "KERS" : "Batería"; }

  constructor(public opt: SessionOptions) {
    this.era = opt.era ?? ERA_2026;
    this.kind = opt.kind;
    this.track = opt.track;
    applyNomination(this.track.def.compuestos);
    this.N = this.track.ms.length;
    this.rng = new Rng(opt.seed);
    this.moodS = ((opt.seed ^ 0x5bd1e995) >>> 0) || 1;
    this.blueS = ((opt.seed ^ 0x1b873593) >>> 0) || 1;
    this.moveS = ((opt.seed ^ 0x85ebca6b) >>> 0) || 1;
    for (const [a, b, k] of opt.rivals ?? []) this.rivalK[pairKey(a, b)] = clamp(k, 0, 1);
    this.weather = opt.weather;
    this.water = Float64Array.from(opt.water.length === this.N ? opt.water : new Array(this.N).fill(0));
    this.waterOff = Float64Array.from(opt.waterOff?.length === this.N ? opt.waterOff : this.water);
    this.rubber = opt.rubber;
    this.hidden = opt.hidden;
    this.sprintWeekend = opt.sprintWeekend;
    this.lapRefRace = this.track.refLap;
    this.tRef = this.track.ms.map((m) => msTimeAtGrip(m, 1));
    {
      // el tope con el que la vuelta dura NEUTRAL_LAP veces la de referencia (por bisección sobre vref)
      const v = this.track.vref, base = v.reduce((a, x) => a + 1 / x, 0);
      const capFor = (k: number) => {
        let lo = 5, hi = 150;
        for (let i = 0; i < 40; i++) { const c = (lo + hi) / 2; if (v.reduce((a, x) => a + 1 / Math.min(x, c), 0) > k * base) lo = c; else hi = c; }
        return (lo + hi) / 2;
      };
      this.neutralCap = { vsc: capFor(NEUTRAL_LAP.vsc), sc: capFor(NEUTRAL_LAP.sc), chase: capFor(NEUTRAL_LAP.chase) };
    }
    {
      // reparto del recorte de energía por minisector: sobre todo a fondo, algo en curva; suma lo mismo en la vuelta
      const w = this.track.ms.map((m) => 0.3 + 0.7 * m.throttle);
      const k = this.tRef.reduce((a, t) => a + t, 0) / this.tRef.reduce((a, t, i) => a + t * w[i], 0);
      this.trimW = w.map((x) => x * k);
      const wc = this.track.ms.map((m) => 0.3 + 0.7 * (1 - m.throttle));
      const kc = this.tRef.reduce((a, t) => a + t, 0) / this.tRef.reduce((a, t, i) => a + t * wc[i], 0);
      this.cornerW = wc.map((x) => x * kc);
    }
    // Batería dentro de la vuelta: se recupera donde se frena o se levanta y se gasta donde se va a fondo
    // (menos al final de las rectas, donde el reglamento recorta la potencia eléctrica). El saldo de la
    // vuelta sigue siendo el del modo elegido (ERS_NET): solo cambia cuándo entra y cuándo sale la energía.
    {
      const ms = this.track.ms, off = ms.map((m, i) => (1 - m.throttle) * this.tRef[i]);
      const on = ms.map((m, i) => m.throttle * clamp((345 - m.vAvg) / 60, 0.3, 1) * this.tRef[i]);
      const sOff = off.reduce((a, b) => a + b, 0) || 1, sOn = on.reduce((a, b) => a + b, 0) || 1;
      // lo que da de sí el circuito: 350 kW el 55 % del tiempo sin gas, con el tope de 8,5 MJ por vuelta
      this.ersLap = clamp(0.35 * 0.55 * sOff, 2.5, 8.5);
      this.ersIn = off.map((x) => x / sOff);
      this.ersOut = on.map((x) => x / sOn);
    }
    this.updateWind();
    // ¿compensa ir a rebufo de otro en una vuelta lanzada? (Monza sí; en circuitos de curvas, aire limpio)
    let bestG = 9, bestNet = 0;
    for (let g = 0.5; g <= 2.5; g += 0.1) {
      let net = 0;
      for (const m of this.track.ms) net += msTimeAtGrip(m, 1 - DIRTY_AIR * m.aero * m.cornerSens * dirtyAir(g)) - msTimeAtGrip(m, 1) - m.dDrag * tow(g) * m.throttle;
      if (net < bestNet) { bestNet = net; bestG = g; }
    }
    this.towTrack = bestNet < -0.05 && bestG < 1.4;
    this.outLapGap = this.towTrack ? Math.max(0.8, bestG) : 2.5;
    this.secStart = [0, this.track.ms.findIndex((m) => m.sector === 1), this.track.ms.findIndex((m) => m.sector === 2)];
    if (opt.setup) {
      // carga: lo que se gana en curva por paso se pierde en recta (la resistencia se ajusta para que la vuelta quede
      // igual); altura: el fondo ayuda donde pesa la carga y estorba en las curvas lentas (media pesada por el agarre)
      let gain = 0, dd = 0, wSum = 0, aSum = 0;
      for (const m of this.track.ms) {
        gain += msTimeAtGrip(m, 1) - msTimeAtGrip(m, 1 + SETUP_GRIP.a * m.aero);
        dd += m.dDrag;
        const w = msTimeAtGrip(m, 1) - msTimeAtGrip(m, 1.01);
        wSum += w; aSum += w * m.aero;
      }
      this.setupK = { opt: opt.setup.opt, dragPerA: dd > 0 ? gain / dd : 0, aeroMean: wSum > 0 ? aSum / wSum : 0.4, lapRef: this.tRef.reduce((a, b) => a + b, 0), mean: [] };
    }
    let t0 = 0, t1 = 0;
    for (const m of this.track.ms) { t0 += msTimeAtGrip(m, 1); t1 += msTimeAtGrip(m, 0.99); }
    this.secPerGrip = t1 - t0;
    // 2026: ~70 kg para una carrera de 305 km
    this.fuelPerLap = (72 * this.track.length) / 305000;
    this.laps = opt.laps ?? this.track.laps;
    this.durationS = (opt.minutes ?? 60) * 60;
    if (this.kind === "Q") { this.parts = partsFor(Q_PARTS, opt.entrants.length); this.breaks = Q_BREAKS; }
    if (this.kind === "SQ") { this.parts = partsFor(SQ_PARTS, opt.entrants.length); this.breaks = SQ_BREAKS; }
    if (this.parts.length) this.durationS = this.parts[0].minutes * 60;

    this.topTeam = { agarre: Math.max(...opt.entrants.map((e) => e.team.agarre)), potencia: Math.max(...opt.entrants.map((e) => e.team.potencia)) };
    {
      const w = [0, 0, 0];
      this.track.ms.forEach((m, i) => { for (let b = 0; b < 3; b++) w[b] += m.band[b] * m.cornerSens * this.tRef[i]; });
      const sum = w[0] + w[1] + w[2] || 1;
      this.bandShare = [w[0] / sum, w[1] / sum, w[2] / sum];
    }
    for (const e of opt.entrants) {
      const d = e.d, team = e.team;
      const car: Car = {
        id: e.id, e, d, team, player: e.player,
        loc: "garage", s: 0, gridS: 0, v: 0,
        tyres: null, usedCompounds: new Set(), stops: 0,
        fuel: 20, soc: SOC_MAX * 0.95,
        push: 2, engine: 1, ers: 1, pitRequest: null,
        wing: 0, floor: 0, delay: 0, msK: -1, lat: 0, latOff: 0, latWant: 0, cross: [], lapTimes: [], lapStart: 0, best: Infinity, bestByPart: [], lapValid: true,
        noise: 0, followGap: 99, aheadId: -1, drs: false, drsEligible: false,
        grant: -1, grantUntil: 0, finishT: 0, plan: { stints: [] }, lastPitLap: -1,
        ...this.carPace(d.ritmo, team, e.form ?? 0),
        wearMult: team.desgaste * (1.18 - d.neumaticos * 0.002),
        slowPuncture: false, autoPush: !e.player, autoErs: true, auto: true, gapWant: 2.5,
        queue: [], eliminated: false, sessionLaps: 0, stintW0: 0, stintL0: 0, learnedLap: -99, lastImpede: -1,
        secCur: [NaN, NaN, NaN], secLast: [NaN, NaN, NaN], secBest: [Infinity, Infinity, Infinity], lastLapValid: true, bestTyreByPart: [], bestSecs: [], bestSecsByPart: [], bestWaterByPart: [], stintLog: [], puKm: 0,
      };
      const su = opt.setup?.cars[e.id];
      if (su) car.setup = { a: su.a, r: su.r };
      const mo = opt.moral?.[e.id];
      if (mo !== undefined) car.moral = clamp(mo, 0, 100);
      this.cars.push(car);
    }
    if (opt.restore) { /* el estado llega de una instantánea */ }
    else if (isRaceKind(this.kind)) this.setupRace(opt.grid ?? opt.entrants.map((e) => e.id));
    else if (this.kind.startsWith("FP")) for (const c of this.cars) c.queue = practiceProgram(this, c);
  }

  get L() { return this.track.length; }
  /** Combustible por vuelta de un coche (kg): el de referencia del circuito por el consumo de su equipo. */
  fuelLap(c: Car) { return this.fuelPerLap * (c.team.consumo ?? 1); }
  carById(id: number) { return this.cars.find((c) => c.id === id)!; }

  log(e: Omit<RaceEvent, "t" | "lap">) {
    // en carrera, tras la bandera a cuadros, los mensajes son de la última vuelta (no de una más)
    const lap = Math.max(1, this.leaderLap + 1);
    const ev = { ...e, t: this.t, lap: isRaceKind(this.kind) ? Math.min(this.laps, lap) : lap };
    this.events.push(ev);
    this.onEvent?.(ev);
  }

  rainOnTrack(): number {
    let r = 0;
    for (const m of this.track.ms) r += rainAt(this.weather, m.x / 1000, m.y / 1000);
    return r / this.N;
  }
  maxRainOnTrack(): number {
    let r = 0;
    for (const m of this.track.ms) r = Math.max(r, rainAt(this.weather, m.x / 1000, m.y / 1000));
    return r;
  }
  avgWater(): number {
    let w = 0;
    for (let i = 0; i < this.N; i++) w += this.water[i];
    return w / this.N;
  }
  sectorWater(): number[] {
    return [0, 1, 2].map((s) => {
      const ms = this.track.ms.filter((m) => m.sector === s);
      return ms.reduce((a, m) => a + this.water[m.i], 0) / ms.length;
    });
  }

  // ---------------------------------------------------------------- carrera
  private setupRace(grid: number[]) {
    this.lapOrder[0] = [...grid];
    const now = this.avgWater();
    // con mucha agua la carrera empieza detrás del coche de seguridad, hasta que se pueda correr
    if (now > WET_SC_START) {
      this.flag = "sc";
      this.scLapsLeft = 2;
      this.scWet = true;
      this.log({ kind: "control", text: `🟨 Salida detrás del coche de seguridad: demasiada agua en pista (${now.toFixed(1)} mm)`, important: true, code: "sc" });
    }
    grid.forEach((id, i) => {
      const c = this.carById(id);
      c.loc = "track";
      c.gridS = -12 - i * 8;
      c.s = c.gridS;
      this.gridSlot(c, i);
      c.fuel = this.fuelLap(c) * this.laps * this.rng.range(0.985, 1.01) + 0.8;
      if (c.player) c.fuel = this.fuelLap(c) * this.laps + 0.5;
      this.rollLaunch(c);
    });
    for (const c of this.cars) {
      if (!grid.includes(c.id)) { c.loc = "out"; c.retireReason = "no sale"; continue; }
      c.plan = planStrategy(this, c, c.e.knowledge, 0, null, 0, this.rng.fork());
      let start = c.plan.stints[0]?.c ?? "M";
      // el muro no mira solo el agua de ahora: también hacia dónde va (radar y previsión)
      const wet = this.startWater(c);
      if (wet > WET.iw * 1.05) start = "W"; else if (wet > WET.si && DRY.includes(start)) start = "I";
      const set = pickSet(c, start, true) ?? pickSet(c, start, false) ?? c.e.sets.find((s) => !s.returned && DRY.includes(s.c))!;
      this.mount(c, set);
      if (this.flag === "green") this.formationLap(c);
    }
  }

  /** La salida de cada uno: reacción y tracción según su habilidad, con azar; de vez en cuando, una mala de verdad. */
  rollLaunch(c: Car) {
    const sk = c.d.salida ?? 85;
    const lr = this.rng.fork();
    const bad = lr.chance(0.03 * (1.9 - sk / 100));
    c.launch = { react: clamp(0.21 + Math.abs(lr.gauss(0, 0.03)) + (90 - sk) * 0.0015, 0.15, 0.45) + (bad ? lr.range(0.1, 0.3) : 0), k: clamp(lr.gauss(1 + (sk - 85) * 0.0025, 0.02), 0.93, 1.06) * (bad ? 0.98 : 1) };
  }

  /** ¿Está arrancando desde la parrilla (salida o salida parada tras bandera roja)? */
  private launching(c: Car, d = 400): boolean {
    if (this.lapsDone(c) === 0 && c.s < d) return true;
    return this.launchT > 0 && c.gridS > 0 && c.s - c.gridS < d;
  }

  /** Tracción en la salida según el compuesto (el blando arranca mejor) y el agua. */
  private launchGrip(c: Car): number {
    const t = c.tyres;
    if (!t) return 1;
    const w = this.water[0] ?? 0;
    if (w > 0.05) return clamp(0.9 * waterGrip(t.c, w) / bestWaterGrip(w), 0.55, 0.92);
    // frente al medio: el blando ~3 % más de tracción y el duro ~3 % menos (no depende de la escala de compuestos)
    return 1 + (COMPOUNDS[t.c].base - COMPOUNDS.M.base) * 2.5;
  }

  mount(c: Car, set: TyreSet) {
    if (c.tyres && c.tyres !== set) this.inspect(c, c.tyres);
    if (isRaceKind(this.kind)) {
      const from = this.lapsDone(c);
      // antes de la salida, cambiar el neumático de salida sustituye al anterior
      if (this.t === 0) c.stintLog = [];
      c.stintLog.push({ c: set.c, from, used: set.laps > 0 });
    }
    warmBlankets(set);
    set.punctured = false;
    set.flatSpot = 0;
    c.tyres = set;
    c.usedCompounds.add(set.c);
    c.stintW0 = setWear(set);
    c.stintL0 = set.laps;
  }

  /** Agua que espera el equipo de c para las primeras vueltas: la de ahora y la prevista en ~6 min. */
  startWater(c: Car): number {
    const now = this.avgWater();
    const fc = teamForecast(this, c);
    const rainSoon = (fc.p50[0] + fc.p50[1]) / 2;
    let w = now;
    const evap = evaporation(this.weather);
    for (let i = 0; i < 6; i++) w = waterStep(w * (1 - CAR_DRY * 0.19 * 60), rainSoon, 60, evap);
    return 0.5 * now + 0.5 * w;
  }

  /** Agua media prevista minuto a minuto con esa lluvia (mm/h): drenaje, evaporación y lo que secan los coches. */
  projectWater(w0: number, rain: (min: number) => number, minutes: number): number[] {
    const evap = evaporation(this.weather);
    const out: number[] = [];
    let w = w0;
    for (let m = 0; m < minutes; m++) {
      w = waterStep(w * (1 - CAR_DRY * 0.19 * 60), rain(m + 0.5), 60, evap);
      out.push(w);
    }
    return out;
  }

  /** Cambia el neumático de salida (antes de la salida). */
  setStartTyre(c: Car, setId: string) {
    if (this.t > 0) return;
    const set = c.e.sets.find((s) => s.id === setId);
    if (!set) return;
    c.usedCompounds = new Set();
    this.mount(c, set);
    c.plan = planStrategy(this, c, c.e.knowledge, 0, set.c, 0, null);
  }
  setFuel(c: Car, marginLaps: number) {
    if (this.t > 0) return;
    c.fuel = this.fuelLap(c) * (this.laps + marginLaps) + 0.5;
  }
  fuelMargin(c: Car) {
    return (c.fuel - 0.5) / this.fuelLap(c) - this.laps;
  }

  /** Orden: carreras por distancia; libres/clasificación por mejor vuelta. */
  order(): Car[] {
    if (!isRaceKind(this.kind)) return this.timingOrder();
    return [...this.cars].sort((a, b) => {
      const fa = a.loc === "fin", fb = b.loc === "fin";
      if (fa && fb) return this.lapsDone(b) - this.lapsDone(a) || a.finishT - b.finishT;
      if (fa !== fb) {
        const la = this.lapsDone(a), lb = this.lapsDone(b);
        if (la !== lb) return lb - la;
        // mismas vueltas: el que sigue en pista ya cruzó esa línea antes de la bandera y
        // terminará con una vuelta más (va delante); un retirado, en cambio, va detrás
        const other = fa ? b : a;
        if (other.loc === "out") return fa ? -1 : 1;
        return fa ? 1 : -1;
      }
      const oa = a.loc === "out", ob = b.loc === "out";
      if (oa !== ob) return oa ? 1 : -1;
      return b.s - a.s;
    });
  }

  /** Orden de clasificación/libres: eliminados al final por su parte. */
  timingOrder(): Car[] {
    const p = this.part;
    return [...this.cars].sort((a, b) => {
      if (this.parts.length) {
        const la = a.eliminated ? a.elimPart! : p, lb = b.eliminated ? b.elimPart! : p;
        if (la !== lb) return lb - la;
        const ta = a.bestByPart[la] ?? Infinity, tb = b.bestByPart[lb] ?? Infinity;
        if (ta !== tb) return ta - tb;
        // sin tiempo en esta parte: por la parte anterior
        for (let k = la - 1; k >= 0; k--) {
          const pa = a.bestByPart[k] ?? Infinity, pb = b.bestByPart[k] ?? Infinity;
          if (pa !== pb) return pa - pb;
        }
        return a.id - b.id;
      }
      if (a.best !== b.best) return a.best - b.best;
      return a.id - b.id;
    });
  }

  lapsDone(c: Car) { return Math.max(0, Math.floor(c.s / this.L)); }

  gapBetween(ahead: Car, behind: Car): number {
    const k = behind.msK;
    if (k < 0) return 0;
    const ta = ahead.cross[k], tb = behind.cross[k];
    if (ta === undefined || tb === undefined) return 0;
    return tb - ta;
  }

  /** Tiempo restante de la sesión o de la parte (s). */
  remaining(): number {
    if (isRaceKind(this.kind)) return 0;
    return Math.max(0, this.durationS - this.partT);
  }

  // ------------------------------------------------------------------ paso
  step() {
    if (this.finished) return;
    const dt = this.dt;
    // salida parada: los cinco semáforos se encienden de uno en uno (1 s cada uno) y se apagan tras una espera.
    // Mientras tanto no corre nada (ni el reloj, ni el tiempo, ni los coches): los resultados no cambian.
    if (isRaceKind(this.kind) && (this.t === 0 || this.restartHold) && this.flag === "green" && (this.startHold ?? 0) < this.startHoldMax()) {
      this.startHold = (this.startHold ?? 0) + dt;
      if (this.startHold >= this.startHoldMax()) {
        if (this.restartHold) {
          this.restartHold = false;
          this.launchT = this.t;
          this.log({ kind: "control", text: "🟢 ¡Se apagan los semáforos! Se reanuda la carrera.", important: true });
        } else this.log({ kind: "control", text: "🟢 ¡Se apagan los semáforos! Arranca la carrera." });
      }
      return;
    }
    this.wall += dt;
    this.weatherAcc += dt;
    if (this.weatherAcc >= 5) {
      stepWeather(this.weather, this.weatherAcc / 60);
      this.updateWater(this.weatherAcc);
      this.updateWind();
      this.weatherAcc = 0;
      this.weatherRadio();
      this.torrentialCheck();
    }
    if (this.inBreak > 0) {
      this.inBreak -= dt;
      if (this.inBreak <= 0) this.startPart();
      return;
    }
    if (this.flag === "red") {
      const race = isRaceKind(this.kind);
      if (race) this.suspended += dt;
      this.flagTimer -= dt;
      if (this.flagTimer <= 0) {
        // con lluvia, no se reanuda hasta que la pista lo permita
        const tooWet = this.redReason === "rain" && (this.avgWater() > 1.5 || Math.max(...this.sectorWater()) > 1.7 || this.maxRainOnTrack() > 8);
        if (race) {
          // reglamento: la carrera no puede pasar de 3 h contando las suspensiones; si no queda
          // tiempo para reanudar con garantías, se da por terminada con lo corrido
          if (this.wall > RACE_WINDOW - 10 * 60) return this.abandon(tooWet ? "la pista sigue impracticable" : "no queda tiempo para reanudar");
          if (tooWet) {
            this.flagTimer = 60;
            if (this.wall - this.redWall > 60 && Math.floor((this.wall - this.redWall) / 1200) !== Math.floor((this.wall - this.redWall - 60) / 1200)) this.log({ kind: "control", text: `🟥 La carrera sigue suspendida: la pista no está en condiciones (agua ${this.avgWater().toFixed(1)} mm). Límite: 3 h desde la salida.`, important: true });
            return;
          }
        } else if (tooWet && this.wall - this.redWall < 45 * 60) { this.flagTimer = 60; return; }
        this.resumeFromRed();
      }
      return;
    }
    this.t += dt;
    if (!isRaceKind(this.kind)) this.partT += dt;
    if (this.timers.length && this.timers.some((x) => x.t <= this.t)) {
      const due = this.timers.filter((x) => x.t <= this.t);
      this.timers = this.timers.filter((x) => x.t > this.t);
      for (const x of due) x.fn();
    }
    this.updateFlags(dt);

    let leader: Car | null = null;
    for (const c of this.cars) if ((c.loc === "track" || c.loc === "pit") && (!leader || c.s > leader.s)) leader = c;
    this.leaderId = leader ? leader.id : -1;

    for (const c of this.cars) {
      const s0 = c.s;
      if (c.loc === "track") this.moveCar(c, dt);
      else if (c.loc === "pit") this.pitStep(c, dt);
      else if (c.loc === "lane_out" || c.loc === "lane_in") this.laneStep(c, dt);
      if (c.e.pu && c.s > s0) c.puKm += ((c.s - s0) / 1000) * PU_WEAR[c.engine];
    }
    this.interactions();
    this.lateral(dt);
    if (!isRaceKind(this.kind)) this.sessionTick();

    if (isRaceKind(this.kind) && this.cars.every((c) => c.loc === "fin" || c.loc === "out")) {
      this.finished = true;
      for (const id of this.ruleBreakers()) {
        const c = this.carById(id);
        this.log({ kind: "control", carId: c.id, text: `⛔ ${c.d.abrev} descalificado: no ha usado dos compuestos de seco`, important: true, code: "descalificado" });
      }
      this.log({ kind: "control", text: `🏁 ${SESSION_NAMES[this.kind]} terminada`, important: true, pause: true });
    }
  }

  /** Cambio de presión dinámica por el viento en cada minisector (0,1 = +10 %: viento de cara). */
  windAir: Float64Array = new Float64Array(0);
  private updateWind() {
    const { speed, dir } = windNow(this.weather);
    const wx = Math.cos(dir) * speed, wy = Math.sin(dir) * speed;
    if (this.windAir.length !== this.N) this.windAir = new Float64Array(this.N);
    for (const m of this.track.ms) {
      const head = -(wx * m.hx + wy * m.hy); // km/h de cara (+) o de cola (−)
      const v = Math.max(60, m.vAvg);
      this.windAir[m.i] = Math.pow((v + head) / v, 2) - 1;
    }
  }

  private updateWater(dtS: number) {
    const w = this.weather;
    const evap = evaporation(w);
    let raining = 0;
    for (let i = 0; i < this.N; i++) {
      const m = this.track.ms[i];
      const r = rainAt(w, m.x / 1000, m.y / 1000);
      raining += r;
      this.water[i] = waterStep(this.water[i], r, dtS, evap);
      this.waterOff[i] = Math.max(this.water[i], waterStep(this.waterOff[i], r, dtS, evap));
    }
    raining /= this.N;
    if (raining > 0.5) this.rubber = Math.max(0, this.rubber - 0.0004 * raining * dtS);
  }

  private weatherRadio() {
    const r = this.maxRainOnTrack();
    const now = r > 0.4;
    if (now && !this.wasRaining && this.wall - this.lastRainMsg > 120) {
      this.lastRainMsg = this.wall;
      const wet = this.track.ms.filter((m) => rainAt(this.weather, m.x / 1000, m.y / 1000) > 0.3);
      const secs = [...new Set(wet.map((m) => m.sector + 1))].sort();
      const all = wet.length > this.N * 0.8;
      const list = secs.length === 1 ? `el sector ${secs[0]}` : `los sectores ${secs.slice(0, -1).join(", ")} y ${secs[secs.length - 1]}`;
      const txt = all ? `🌧️ Empieza a llover en todo el circuito (${r.toFixed(1)} mm/h)` : secs.length === 3 ? `🌧️ Lluvia en zonas de los tres sectores; hay tramos aún secos` : `🌧️ Lluvia en ${list}; el resto sigue seco`;
      this.log({ kind: "weather", text: txt, important: true, code: "lluvia" });
    }
    if (!now && this.wasRaining && this.wall - this.lastRainMsg > 120) {
      this.lastRainMsg = this.wall;
      this.log({ kind: "weather", text: "🌤️ Deja de llover. La pista empezará a secarse por la trazada.", important: true, code: "seca" });
    }
    this.wasRaining = now;
  }

  private updateFlags(dt: number) {
    if (this.flag === "vsc") {
      this.flagTimer -= dt;
      if (this.flagTimer <= 0) {
        this.flag = "green";
        this.log({ kind: "control", text: "🟢 Fin del coche de seguridad virtual", important: true, code: "verde" });
      }
    }
  }

  /** Neutraliza la carrera. `sev` (0 a 1): lo que tardan en limpiar (grúa, barreras, restos). */
  deploy(kind: "vsc" | "sc", why: string, sev = 0.5) {
    if (this.chequered || this.flag === "sc" || this.flag === "red") return;
    if (kind === "vsc" && this.flag === "vsc") { this.flagTimer += 40; return; }
    // un coche de seguridad sobre un virtual: el virtual se acaba
    if (kind === "sc" && this.flag === "sc_in") return;
    this.flag = kind;
    this.stats[kind]++;
    if (kind === "vsc") {
      this.flagTimer = this.rng.range(60, 110) + 120 * sev;
      this.log({ kind: "control", text: `🟡 COCHE DE SEGURIDAD VIRTUAL — ${why}`, pause: true, important: true, code: "vsc" });
    } else {
      this.scLapsLeft = clamp(2 + Math.round(sev * 2.5) + this.rng.int(0, 1), 2, 6);
      this.log({ kind: "control", text: `🟨 COCHE DE SEGURIDAD — ${why}`, pause: true, important: true, code: "sc" });
    }
  }

  /** Lo nuevo que es en la F1: 1 novato, 0,5 en su segundo año, 0 a partir del tercero. */
  greenness(c: Car): number {
    const y = this.opt.year ?? 2026;
    const exp = c.d.debut === undefined ? 0 : y - c.d.debut;
    return exp <= 0 ? 1 : exp === 1 ? 0.5 : 0;
  }

  /** Un error le hace perder confianza (y si ya iba mal, más). */
  private shake(c: Car, x: number) {
    c.conf = clamp((c.conf ?? 0) - x, -1, 1);
    if (c.player && (c.conf ?? 0) < -0.45) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev}, tranquilo, respira. Vamos vuelta a vuelta.` });
  }

  /**
   * Vuelta de formación: los neumáticos salen de las mantas a 70 °C y en la vuelta cogen temperatura según el
   * compuesto (el blando se calienta antes que el duro) y el asfalto; en la parrilla se vuelven a enfriar algo.
   */
  formationLap(c: Car) {
    const t = c.tyres;
    if (!t) return;
    const gain = (FORMATION_GAIN[t.c] ?? 10) + 0.3 * (this.weather.trackT - 25) - 6 * Math.min(1, this.avgWater());
    for (const a of [t.F, t.R]) { a.tBulk = clamp(a.tBulk + gain, 50, 100); a.tSurf = a.tBulk + 3; }
  }

  /**
   * Cómo se defiende c: lo que pida el jugador o, en automático, lo que haría el equipo: cerrar la puerta en las
   * últimas vueltas cuando hay puntos en juego, y si no, defenderse sin más (lo normal).
   */
  /** Pelea en duro: solo tus pilotos con la orden dada (en automático, el equipo va en limpio). */
  hard(c: Car): boolean {
    return c.player && !this.autoPlayers && c.risk === "duro";
  }

  fightMode(c: Car): "normal" | "defend" | "yield" {
    const f = c.player && !this.autoPlayers ? c.fight ?? "auto" : "auto";
    if (f !== "auto") return f;
    if (this.laps - this.lapsDone(c) <= 8) {
      const ord = this.lapOrder[this.leaderLap];
      const pos = ord ? ord.indexOf(c.id) : -1;
      if (pos >= 0 && pos < 10) return "defend";
    }
    return "normal";
  }

  /** Daño en el fondo: menos carga hasta el final (no se arregla en una parada) y algo más de riesgo de avería. */
  private damageFloor(c: Car, x: number, how: string) {
    c.floor = Math.min(0.03, c.floor + x);
    if (c.player) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev}, daño en el fondo ${how}. Perdemos ~${(c.floor * 100 * this.secPerGrip).toFixed(1)} s por vuelta y no se puede arreglar en boxes.`, important: true, code: "fondo" });
  }

  /** Lo que cuesta por vuelta el alerón dañado (s). */
  wingLoss(c: Car) { return c.wing * 100 * this.secPerGrip; }

  /** ¿Se cambia el morro en esta parada? En automático, si lo que queda de carrera con el alerón cuesta más que el cambio. */
  private changeNose(c: Car): boolean {
    if (c.wing <= 0) return false;
    const ch = c.player && !this.autoPlayers ? c.nose ?? "auto" : "auto";
    if (ch === "yes") return true;
    if (ch === "no") return false;
    return this.wingLoss(c) * (this.laps - this.lapsDone(c)) > NOSE_TIME;
  }

  /** Sanción de tiempo: se cumple en la próxima parada o se suma al final. */
  penalize(c: Car, secs: number, why: string, motivo?: RaceEvent["motivo"], cierra?: number) {
    if (c.loc === "out" || c.loc === "fin") return;
    c.penS = (c.penS ?? 0) + secs;
    this.stats.pens++;
    this.log({ kind: "control", carId: c.id, text: `⚖️ ${secs} s de sanción para ${c.d.abrev}: ${why}`, important: c.player, pause: c.player, code: "sancion", n: secs, motivo, cierra });
  }

  /** Llega a meta: lo que no ha cumplido en una parada se suma al tiempo. */
  private finishCar(c: Car, t: number) {
    c.loc = "fin";
    c.finishT = t;
    if (c.penS) {
      c.finishT += c.penS;
      c.penAdded = c.penS;
      this.log({ kind: "control", carId: c.id, text: `⚖️ A ${c.d.abrev} se le suman ${c.penS} s de sanción al tiempo final`, important: c.player });
      c.penS = 0;
    }
  }

  /** Límites de pista: a la tercera, bandera blanca y negra; a la cuarta, 5 s; y otros 5 cada tres más. */
  private trackLimits(c: Car, m: Minisector) {
    const n = (c.tlStrikes = (c.tlStrikes ?? 0) + 1);
    if (n === 3) this.log({ kind: "control", carId: c.id, text: `🏁 Bandera blanca y negra para ${c.d.abrev}: límites de pista`, important: c.player, code: "blancaNegra" });
    else if (n >= 4 && (n - 4) % 3 === 0) this.penalize(c, 5, `límites de pista (${n} veces)`, "limites");
    else if (c.player && n < 3) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev}, se ha pasado de los límites de pista en el sector ${m.sector + 1} (${n} de 3 antes de la bandera).`, code: "limites" });
  }

  /**
   * Los comisarios deciden sobre los toques: la culpa suele ser del que ataca, más si es agresivo y el otro no; en la
   * salida, con todos en grupo, casi siempre es un incidente de carrera. 5 s, o 10 s si acabó en pinchazo o accidente.
   */
  private stewards() {
    for (const p of this.probes.filter((x) => x.at <= this.t)) {
      const c = this.carById(p.c), a = this.carById(p.a);
      // moverse en la frenada (con su propio azar)
      if (p.move) {
        if (a.loc === "out" || a.loc === "fin") continue;
        if (this.moveRoll(MOVE2_PEN)) this.penalize(a, 5, `moverse en la frenada delante de ${c.d.abrev}`, "frenada", a.id);
        else this.log({ kind: "control", carId: a.id, text: `⚖️ ${a.d.abrev}: advertencia por moverse en la frenada delante de ${c.d.abrev}`, important: a.player || c.player, code: "sinSancion", other: c.id });
        continue;
      }
      if (this.rng.chance(p.lap1 ? 0.6 : 0.35)) {
        this.log({ kind: "control", carId: c.id, text: `⚖️ Toque entre ${c.d.abrev} y ${a.d.abrev}: sin sanción, incidente de carrera`, important: c.player || a.player, code: "sinSancion", other: a.id });
        continue;
      }
      // la culpa suele ser del que se mete en el sitio del otro: el que ataca o el que cierra la puerta tarde
      const blameC = clamp((p.byDef ? 0.3 : 0.62) + (c.d.agresividad - a.d.agresividad) / 120 + (this.hard(c) ? RISK_BLAME : 0) - (this.hard(a) ? RISK_BLAME : 0), 0.1, 0.9);
      const who = this.rng.chance(blameC) ? c : a, other = who === c ? a : c;
      if (who.loc === "out" || who.loc === "fin") continue;
      const closed = p.byDef && who === a;
      this.penalize(who, p.sev >= 0.6 ? 10 : 5, closed ? `cerrar la puerta tarde a ${other.d.abrev} y provocar un toque` : `provocar un toque con ${other.d.abrev}`, "toque", closed ? a.id : undefined);
    }
    this.probes = this.probes.filter((x) => x.at > this.t);
  }

  /** Doblados por el líder que siguen en pista (no en boxes). */
  lappedCars(): Car[] {
    const lead = this.leaderId >= 0 ? this.carById(this.leaderId) : null;
    if (!lead) return [];
    return this.cars.filter((c) => c.loc === "track" && lead.s - c.s > this.L);
  }

  /** El líder acelera: cada uno arranca al ver acelerar al de delante (un acordeón de unas décimas por coche). */
  private restartGo() {
    if (!this.scGo) return;
    this.scGo.t = this.t;
    this.order().filter((c) => c.loc === "track").forEach((c, i) => { c.scGoT = this.t + (i === 0 ? 0 : 0.2 + 0.12 * i + this.rng.range(0, 0.15) + (90 - c.d.salida) * 0.004); });
    this.log({ kind: "control", text: "🟢 El líder acelera: relanzada", important: false, code: "liderAcelera" });
  }

  /** Amarilla activa en ese minisector (o en el de antes: se avisa antes de llegar). */
  yellowAt(ms: number) {
    this.yellows = this.yellows.filter((y) => y.until > this.t);
    return this.yellows.find((y) => y.ms === ms || (y.ms + 1) % this.N === ms || (y.ms - 1 + this.N) % this.N === ms);
  }

  private yellow(ms: number, double: boolean, secs: number, why: string) {
    this.yellows.push({ ms, until: this.t + secs, double });
    this.log({ kind: "control", text: `⚠️ Bandera amarilla${double ? " doble" : ""} en el sector ${this.track.ms[ms].sector + 1}: ${why}`, code: "banderaAmarilla" });
  }

  /**
   * Salida parada tras una bandera roja: todos a la parrilla en el orden de carrera (los doblados, desdoblados), con
   * semáforos. Lo que falta de la vuelta se hace por el pit-lane y la vuelta de formación cuenta como vuelta de carrera.
   */
  private standingRestart() {
    const ord = this.order().filter((c) => c.loc === "track");
    if (!ord.length) return;
    const line = (Math.floor((ord[0].s + 30) / this.L) + 1) * this.L;
    ord.forEach((c, i) => this.jumpTo(c, line - 12 - i * 8));
    const lap = Math.round(line / this.L);
    if (this.laps - lap > 3) this.laps--;
    this.drsEnabledFromLap = lap + 3;
    this.restartHold = true;
    this.startHold = 0;
    ord.forEach((c, i) => { c.gridS = c.s; c.v = 0; c.delay = 0; this.rollLaunch(c); this.formationLap(c); this.gridSlot(c, i); });
    this.log({ kind: "control", text: `🚦 La carrera se reanuda con salida parada, en el orden de carrera. Quedan ${this.laps - lap} vueltas.`, important: true, pause: true, code: "salidaParada" });
  }

  /** Lleva un coche hacia delante sin recorrer la pista (pit-lane y vuelta de formación tras una bandera roja). */
  private jumpTo(c: Car, sNew: number) {
    if (sNew > c.s) {
      const newK = Math.floor(sNew / this.L) * this.N + this.msIndexAt(sNew);
      for (let k = c.msK + 1; k <= newK; k++) {
        c.cross[k] = this.t;
        // vuelta por el pit-lane: no cuenta para la mejor vuelta ni para el ritmo
        if (k > 0 && k % this.N === 0) { c.lapTimes.push(this.lapRefRace * 1.6); c.lapStart = this.t; }
      }
      c.msK = Math.max(c.msK, newK);
      c.fuel = Math.max(0.5, c.fuel - (this.fuelLap(c) * 0.4 * (sNew - c.s)) / this.L);
    }
    c.s = sNew;
  }

  /** Bandera roja. En libres/clasificación todos al garaje; en carrera, se para con cambio libre de neumáticos. */
  redFlag(why: string, rain = false) {
    if (this.flag === "red" || this.chequered) return;
    if (!isRaceKind(this.kind) && this.remaining() <= 0) return;
    this.flag = "red";
    this.stats.red++;
    this.redReason = rain ? "rain" : "crash";
    this.redWall = this.wall;
    this.redLap = this.leaderLap + 1;
    if (!isRaceKind(this.kind)) {
      this.flagTimer = rain ? this.rng.range(300, 600) : this.rng.range(240, 600);
      this.log({ kind: "control", text: `🟥 BANDERA ROJA — ${why}. Todos a boxes.`, pause: true, important: true, code: "roja" });
      for (const c of this.cars) if (c.loc === "track" || c.loc === "lane_out" || c.loc === "lane_in") this.toGarage(c);
      return;
    }
    this.flagTimer = rain ? this.rng.range(600, 900) : this.rng.range(900, 1800);
    this.log({ kind: "control", text: `🟥 BANDERA ROJA — ${why}. Carrera suspendida: todos al pit-lane. Se pueden cambiar neumáticos.`, pause: true, important: true, code: "roja" });
    for (const c of this.cars) {
      if (c.loc === "pit" && c.pit) {
        // la parada en curso se completa
        const set = c.e.sets.find((x) => x.id === c.pit!.setId);
        if (set && !c.pit.changed) { this.mount(c, set); c.stops++; c.lastPitLap = this.lapsDone(c); }
        c.s = c.pit.entryS + c.pit.dist;
        c.pit = undefined;
        c.loc = "track";
      }
      if (c.loc !== "track") continue;
      c.pitRequest = null;
      c.slowPuncture = false;
      if (c.tyres) c.tyres.punctured = false;
      c.v = 0;
      if (!c.player) aiRedFlagTyres(this, c);
    }
  }

  /** Cambio de neumáticos durante la bandera roja (no cuenta como parada). */
  redFlagChange(c: Car, setId: string) {
    if (this.flag !== "red" || !isRaceKind(this.kind) || c.loc !== "track") return false;
    const set = c.e.sets.find((x) => x.id === setId && !x.returned);
    if (!set || set === c.tyres) return false;
    this.mount(c, set);
    c.wing = 0;
    c.plan = { stints: [...c.plan.stints.slice(0, c.stops), ...planStrategy(this, c, c.e.knowledge, this.lapsDone(c), set.c, 0, null).stints] };
    this.log({ kind: "pit", carId: c.id, text: `🔧 ${c.d.abrev} cambia a ${COMPOUNDS[set.c].name.toLowerCase()} durante la bandera roja`, important: c.player });
    return true;
  }

  /** Suspendida y no reanudada: clasificación al final de la penúltima vuelta antes de la suspensión. */
  private abandon(why: string) {
    const L = Math.max(0, this.redLap - 2);
    const k = L * this.N;
    const ran = this.cars.filter((c) => c.retireReason !== "no sale");
    // orden: más vueltas completadas en L y, a igualdad, quien cruzó antes la línea
    const done = (c: Car) => { let n = Math.min(L, Math.floor(Math.max(0, c.msK) / this.N)); while (n > 0 && c.cross[n * this.N] === undefined) n--; return n; };
    const order = [...ran].sort((a, b) => {
      const na = done(a), nb = done(b);
      if (na !== nb) return nb - na;
      return (a.cross[na * this.N] ?? Infinity) - (b.cross[nb * this.N] ?? Infinity);
    });
    // clasificados: los que seguían en carrera en esa vuelta (aunque abandonaran después)
    const fin = order.filter((c) => c.loc !== "out" || done(c) >= L);
    this.shortened = { laps: L, order: order.map((c) => c.id), fin: fin.map((c) => c.id) };
    for (const c of fin) { c.finishT = c.cross[done(c) * this.N] ?? c.finishT; if (c.loc !== "out") c.loc = "fin"; }
    void k;
    const pct = this.laps ? L / this.laps : 0;
    const table = this.pointsTable();
    this.chequered = true;
    this.finished = true;
    this.log({ kind: "control", text: `🏁 La carrera no se reanudará (${why}). Cuenta la clasificación al final de la vuelta ${L} (${Math.round(pct * 100)} % de la distancia): ${!table ? "puntos completos" : table.length ? "puntos reducidos" : "sin puntos"}.`, important: true, pause: true });
  }

  /** Puntos de una carrera suspendida y no reanudada (null: los normales). */
  pointsTable(): number[] | null {
    if (!this.shortened) return null;
    if (this.greenLeaderLaps < 2 || this.shortened.laps < 2) return [];
    const pct = this.shortened.laps / this.laps;
    if (this.kind === "SPRINT") return pct < 0.75 ? SPRINT_HALF : null;
    if (pct < 0.25) return [6, 4, 3, 2, 1];
    if (pct < 0.5) return [13, 10, 8, 6, 5, 4, 3, 2, 1];
    if (pct < 0.75) return [19, 14, 12, 9, 8, 6, 5, 3, 2, 1];
    return null;
  }

  private resumeFromRed() {
    this.flag = "green";
    const rain = this.redReason === "rain";
    this.redReason = null;
    if (!isRaceKind(this.kind)) {
      this.log({ kind: "control", text: "🟢 Se reanuda la sesión. Pit-lane abierto.", important: true, pause: true });
      return;
    }
    // con lluvia se reanuda detrás del coche de seguridad y, cuando se retira (si la pista lo permite), salida parada
    // desde la parrilla, como en el reglamento; si no, salida parada directamente
    if (!rain) return this.standingRestart();
    this.flag = "sc";
    this.scLapsLeft = 2;
    this.scWet = true;
    this.standAfterSc = true;
    this.drsEnabledFromLap = this.leaderLap + 4;
    this.log({ kind: "control", text: "🟨 Se reanuda la carrera detrás del coche de seguridad; después, salida parada", important: true, pause: true });
  }

  /** Lluvia torrencial: bandera roja. */
  private torrentialCheck() {
    if (this.flag === "red" || this.chequered || this.inBreak > 0) return;
    const w = this.avgWater();
    const worstSector = Math.max(...this.sectorWater());
    let worstMs = 0;
    for (let i = 0; i < this.N; i++) worstMs = Math.max(worstMs, this.water[i]);
    if (w > 2.1 || worstSector > 2.2 || (worstMs > 2.6 && w > 1.0) || (w > 1.5 && this.maxRainOnTrack() > 25)) {
      const where = this.track.ms.reduce((b, m) => (this.water[m.i] > this.water[b.i] ? m : b));
      this.redFlag(`lluvia torrencial, agua estancada en el sector ${where.sector + 1}`, true);
    }
  }

  /**
   * Lo que hace dirección de carrera con un coche parado o con restos en pista. Cuenta lo grave que es, de qué tipo es
   * (un accidente deja restos y barreras dañadas; una avería, un coche parado; los restos, poca cosa) y dónde: en un
   * urbano no hay escapatorias y cualquier coche parado es un peligro.
   */
  private incident(c: Car, why: string, severity: number, kind: IncidentKind = "crash") {
    const ms = this.msIndexAt(c.s);
    if (!isRaceKind(this.kind)) {
      if (kind === "crash" && this.rng.chance(0.3 + 0.6 * severity)) this.redFlag(why);
      else this.yellow(ms, true, this.rng.range(40, 90), why);
      return;
    }
    const urban = !!(this.track.def.urbano ?? this.track.def.entorno);
    // un accidente fuerte (barreras dañadas) puede parar la carrera
    if (kind === "crash" && severity >= 0.7 && this.rng.chance((urban ? 0.16 : 0.08) * severity)) { this.redFlag(`accidente de ${c.d.abrev}, reparación de barreras`); return; }
    let pSC: number, pVSC: number;
    if (kind === "crash") { pSC = urban ? 0.75 : 0.45 + 0.4 * severity; pVSC = urban ? 0.2 : 0.4; }
    else if (kind === "failure") { pSC = urban ? 0.45 : 0.18 + 0.3 * severity; pVSC = urban ? 0.4 : 0.42; }
    else { pSC = urban ? 0.25 : 0.08; pVSC = urban ? 0.4 : 0.28; }
    // antes de 2015 no había virtual: algunas de esas veces salía el de verdad y el resto bastaba con amarillas
    if (!this.era.vsc) { pSC += pVSC * 0.35; pVSC = 0; }
    const r = this.rng.next();
    if (r < pSC) this.deploy("sc", why, severity + (urban ? 0.2 : 0));
    else if (r < pSC + pVSC) this.deploy("vsc", why, severity);
    else this.yellow(ms, kind !== "debris", this.rng.range(50, 140), why);
  }

  /**
   * Empieza una avería. La mitad rompe de golpe; el resto avisa antes (temperaturas, presión) y va a más cada vuelta:
   * mucho más despacio con el motor en Ahorro y levantando (ritmo bajo), así que a veces se puede llegar a meta.
   */
  private fault(c: Car, what: string, pu: boolean) {
    if (c.fault || !FAULT_SIGNS[what] || this.rng.chance(0.5)) { if (pu) c.puBroken = true; return this.failure(c, what); }
    c.fault = { what, lvl: this.rng.range(0.25, 0.5), pu, warned: 0 };
    this.faultRadio(c);
  }

  /** Cada vuelta: la avería avanza según cómo se le trate; al llegar a 1, se rompe. */
  private faultLap(c: Car) {
    const f = c.fault!;
    const grow = FAULT_GROW * FAULT_ENGINE[c.engine] * FAULT_PUSH[c.push] * this.rng.range(0.6, 1.4);
    f.lvl += grow;
    if (f.lvl >= 1) {
      c.fault = undefined;
      if (f.pu) c.puBroken = true;
      return this.failure(c, f.what);
    }
    if (f.lvl > 0.75 && f.warned < 2) { f.warned = 2; this.faultRadio(c); }
  }

  private faultRadio(c: Car) {
    const f = c.fault!;
    if (!c.player) return;
    const sign = FAULT_SIGNS[f.what];
    const txt = f.warned === 2
      ? `📻 Ingeniero: ${c.d.abrev}, ${sign} va a peor. Si no lo cuidamos, no llegamos.`
      : `📻 Ingeniero: ${c.d.abrev}, ${sign}. Motor en Ahorro y levantar antes de frenar: así puede aguantar.`;
    this.log({ kind: "radio", carId: c.id, text: txt, important: true, pause: true });
  }

  /** Avería en carrera: muchas dejan llegar al garaje (sin neutralizar); si no, el coche se queda en la pista. */
  private failure(c: Car, what: string) {
    const sev = this.rng.range(0, 0.6);
    // la mayoría avisan lo justo para llegar al garaje; las que no, dejan el coche en la pista
    if (sev < 0.42 && this.rng.chance(0.75)) this.retire(c, `avería (${what}), se retira en boxes`, 0, "garage");
    else this.retire(c, `avería (${what})`, sev, "failure");
  }

  retire(c: Car, reason: string, severity: number, kind: IncidentKind | "garage" = "crash") {
    c.loc = "out";
    this.stats.retire++;
    c.retireReason = reason;
    c.v = 0;
    c.run = undefined;
    c.queue = [];
    this.log({ kind: "incident", text: `❌ ${c.d.abrev} ${isRaceKind(this.kind) ? "abandona" : "se queda fuera"}: ${reason}`, carId: c.id, important: true, pause: c.player, code: "abandono" });
    if (kind !== "garage") this.incident(c, `${c.d.abrev} (${reason})`, severity, kind);
  }

  /** Tiempo objetivo del coche en un minisector, con su estado actual. */
  msTime(c: Car, m: Minisector, water: number): { t: number; grip: number } {
    const tyres = c.tyres!;
    const wetSkill = water > 0.05 ? 1 + (c.d.lluvia - 80) * 0.0012 * Math.min(1, water / 0.6) : 1;
    let grip = setGrip(tyres, water) * (c.paceBand[0] * m.band[0] + c.paceBand[1] * m.band[1] + c.paceBand[2] * m.band[2]) * (1 + CONF_PACE * (c.conf ?? 0)) * (c.moral === undefined ? 1 : 1 + MORAL_PACE * clamp((c.moral - 60) / 40, -1.5, 1)) * wetSkill * PUSH_GRIP[c.push] * (1 + 0.018 * this.rubber) * (1 - c.wing - c.floor);
    const su = this.setupAt(c, m, water);
    if (su) grip *= 1 + SETUP_GRIP.a * su.ea * m.aero - SETUP_GRIP.r * su.er * (m.aero - this.setupK!.aeroMean);
    // fuera de la trazada se agarra menos (sin goma y con gravilla de neumático)
    const off = c.offLine ?? 0;
    if (off > 0) grip *= 1 - OFFLINE_GRIP * m.cornerSens * off * off * (0.6 + 0.4 * this.rubber);
    // en paralelo (adelantando) ya no va en la estela; apartado a un lado, solo en parte
    if (c.aheadId >= 0 && c.grant !== c.aheadId) grip *= 1 - DIRTY_AIR * m.aero * m.cornerSens * dirtyAir(c.followGap) * wake(c.aheadDl ?? 0, WAKE_DIRTY) * (su ? 1 + 0.06 * su.ea : 1);
    // viento: de cara frena en recta pero da carga en curva; de cola, al revés
    const air = this.windAir[m.i];
    grip *= 1 + 0.5 * m.aero * m.cornerSens * air;
    let t = msTimeAtGrip(m, grip);
    const scale = t / this.tRef[m.i];
    let power = (this.topTeam.potencia + (c.team.potencia - this.topTeam.potencia) * TEAM_SPREAD) * 0.6 + ENGINE_POWER[c.engine] + this.era.ers * (c.soc > 0.05 || c.ers === 0 ? ERS_POWER[c.ers] : -3.5);
    if (c.e.pu) power -= puPowerLoss(puLife(c.e.pu.km0 + c.puKm));
    // un motor o una batería tocados no dan todo
    if (c.fault && (c.fault.what === "motor" || c.fault.what === "unidad de potencia" || c.fault.what === "MGU-K" || c.fault.what === "batería")) power -= 1.2 * c.fault.lvl;
    if (c.drs && m.drs) power += MO_POWER;
    let dragCut = -c.team.resistencia - WATER_DRAG * Math.min(3, water);
    if (c.aheadId >= 0) dragCut += tow(c.followGap) * wake(c.aheadDl ?? 0, WAKE_TOW) * m.throttle;
    dragCut -= 100 * air;
    if (su) dragCut -= this.setupK!.dragPerA * su.ea;
    t -= scale * (m.dPower * power + m.dDrag * dragCut);
    t += m.dMass * (MIN_MASS + c.fuel - REF_CAR.mass);
    if (su) t *= 1 + su.pen;
    t *= 1 + this.deployTrim(c) * this.trimW[m.i] + this.qualiEvo() * this.cornerW[m.i];
    t *= 1 + c.noise;
    return { t, grip };
  }

  /**
   * Ritmo del coche: el del piloto más el del coche en cada tipo de curva (agarre + curvas, con TEAM_SPREAD respecto al
   * mejor agarre de la parrilla); pace es la media con lo que pesa cada tipo de curva en este circuito.
   */
  private carPace(ritmo: number, team: TeamDef, form = 0): { pace: number; paceBand: [number, number, number] } {
    const drv = (ritmo - 85) * 0.0007 + form;
    const cv = team.curvas ?? [0, 0, 0];
    const paceBand = cv.map((x) => 1 + drv + (this.topTeam.agarre + (team.agarre + x - this.topTeam.agarre) * TEAM_SPREAD) / 180) as [number, number, number];
    const w = this.bandShare;
    return { pace: paceBand[0] * w[0] + paceBand[1] * w[1] + paceBand[2] * w[2], paceBand };
  }

  /** Lo que le falta a la pista (y a los pilotos) en este momento de la clasificación (ver QUALI_EVO). */
  private qualiEvo(partT = this.partT): number {
    const D = QUALI_EVO[this.kind];
    if (!D || !this.parts.length) return 0;
    let total = 0, done = 0;
    this.parts.forEach((p, i) => { total += p.minutes * 60; if (i < this.part) done += p.minutes * 60; });
    done += Math.min(partT, this.durationS);
    // llega a cero al empezar la última salida (unos 3 min antes del final), no con la bandera: si no, la vuelta de la
    // pole aún arrastraría un poco y la pole saldría más lenta que la real
    return D * Math.max(0, 1 - done / (total - QUALI_EVO_END));
  }

  /**
   * Lo que va a mejorar la pista hasta el final de esta parte (fracción de la vuelta) desde la mejor vuelta de `c` en
   * ella (o desde ahora): lo que le queda por bajar a ese tiempo si vuelve a salir al final. Lo mira el muro.
   */
  qualiEvoGain(c?: Car): number {
    const from = c && c.bestEvo?.part === this.part ? c.bestEvo.evo : this.qualiEvo();
    return Math.max(0, from - this.qualiEvo(this.durationS));
  }

  /** Lo que se pierde por no ir en modo de clasificación (ver DEPLOY_TRIM). */
  private deployTrim(c: Car): number {
    // en libres y clasificación, la vuelta estimada («Posible») es la de una vuelta lanzada
    if (c.run?.phase === "push" || (this.estimating && !isRaceKind(this.kind))) return isQualiKind(this.kind) ? 0 : PRACTICE_PUSH_TRIM[this.kind] ?? DEPLOY_TRIM[this.kind];
    return DEPLOY_TRIM[this.kind];
  }

  /**
   * Reglaje del coche en este minisector: lo lejos que está del óptimo (que con agua pide más carga y más altura) y lo
   * que cuesta en tiempo (fracción), medido contra la media de la parrilla para que el ritmo medio no cambie.
   */
  setupAt(c: Car, m: Minisector, water: number): { ea: number; er: number; pen: number } | null {
    const K = this.setupK;
    if (!K || !c.setup) return null;
    const wk = Math.min(1, water / 0.8);
    const oa = K.opt.a + WET_SHIFT.a * wk, or = K.opt.r + WET_SHIFT.r * wk;
    const cost = (s: Setup) => { const ea = s.a - oa, er = s.r - or; return SETUP_Q.a * ea * ea + SETUP_Q.r * er * er * (er < 0 ? 1.3 : 1); };
    let mean = K.mean[m.i];
    if (!mean || mean.wk !== wk) {
      let sum = 0, n = 0;
      for (const o of this.cars) if (o.setup) { sum += cost(o.setup); n++; }
      mean = K.mean[m.i] = { wk, v: n ? sum / n : 0 };
    }
    return { ea: c.setup.a - oa, er: c.setup.r - or, pen: (cost(c.setup) - mean.v) / K.lapRef };
  }

  /** Desgaste por el reglaje: con más carga el coche desliza menos; muy bajo, rebota y castiga la goma. */
  private setupWear(c: Car, m: Minisector, water: number): number {
    const su = this.setupAt(c, m, water);
    return su ? clamp(1 - 0.025 * su.ea - 0.02 * su.er, 0.9, 1.1) : 1;
  }

  /** Factor de ritmo según la fase de la tanda (libres/clasificación). */
  private phaseScale(c: Car): { speed: number; energy: number } {
    const ph = c.run?.phase;
    if (ph === "out") return { speed: 0.86, energy: 1.0 };
    if (ph === "cool") return { speed: 0.8, energy: 0.55 };
    if (ph === "in") return { speed: 0.84, energy: 0.6 };
    return { speed: 1, energy: 1 };
  }

  private moveCar(c: Car, dt: number) {
    const L = this.L;
    const pos = ((c.s % L) + L) % L;
    const msI = this.msIndexAt(c.s);
    const m = this.track.ms[msI];
    // fuera de la trazada se pisa el agua que no han apartado los demás (con la línea seca abierta, bastante más)
    const water = this.water[m.i] + Math.min(1, c.offLine ?? 0) * Math.max(0, this.waterOff[m.i] - this.water[m.i]);
    const { t } = this.msTime(c, m, water);
    const pi = Math.min(this.track.vref.length - 1, Math.floor(pos / this.track.ds));
    const ph = this.phaseScale(c);
    let v = this.track.vref[pi] * (this.tRef[m.i] / t) * ph.speed;
    // libres/clasificación: en la vuelta de salida se levanta para abrir hueco con el de delante
    // (o para quedarse a rebufo en Monza), sin arriesgarse a no llegar a la bandera
    // (solo en la parte final de la vuelta y no todos con el mismo cuidado: los huecos no salen perfectos)
    if (!isRaceKind(this.kind) && c.run && (c.run.phase === "out" || c.run.phase === "cool") && pos > this.L * 0.5 && c.aheadId >= 0 && c.followGap < c.gapWant) {
      const a = this.carById(c.aheadId);
      if (a.loc === "track" && !this.isFlying(a) && a.run?.phase !== "in") {
        const toLine = (this.L - pos) / Math.max(30, this.track.vref[pi] * 0.8);
        if (this.remaining() - toLine > 12) v *= 0.86;
      }
    }

    if (isRaceKind(this.kind) && this.launching(c)) {
      // salida parada: cada uno reacciona y tracciona distinto (piloto, compuesto y agua)
      const la = c.launch ?? { react: 0, k: 1 };
      if (this.flag === "green" && this.t - this.launchT < la.react) v = 0;
      else v = Math.min(v, Math.sqrt(2 * 11 * la.k * this.launchGrip(c) * Math.max(0.3, c.s - c.gridS + 0.3)));
    }
    // neutralizaciones: por encima del tope del circuito, a su velocidad (en la escala del ritmo de cada uno)
    const neutral = (cap: number) => (this.track.vref[pi] > cap ? v * cap / this.track.vref[pi] : v);
    if (this.flag === "vsc") v = neutral(this.neutralCap.vsc);
    if (this.flag === "sc" || this.flag === "sc_in") {
      if (c.unlap) v = Math.min(v, this.track.vref[pi] * 0.8); // desdoblándose: a buen ritmo hasta la cola del grupo
      else if (this.scGo?.t != null && this.t >= (c.scGoT ?? Infinity)) { /* relanzada: ya acelera */ }
      else {
        // el líder, al ritmo del coche de seguridad; detrás, el que va lejos del de delante va a por el grupo
        const lead = c.id === this.leaderId;
        v = neutral(lead || (c.followGap <= 1.0 && c.aheadId >= 0) ? this.neutralCap.sc : this.neutralCap.chase);
        if (lead) {
          // última vuelta del coche de seguridad: el líder agrupa a todos y acelera donde quiere antes de la meta
          if (this.flag === "sc_in" && this.scGo && this.scGo.t === null) {
            if (pos >= this.L - this.scGo.at) { this.restartGo(); v = this.track.vref[pi] * (this.tRef[m.i] / t) * ph.speed; }
            else if (pos >= this.L - this.scGo.at - 500) v = Math.min(v, this.track.vref[pi] * 0.42, 40);
          }
        }
      }
    } else if (this.flag === "green" && this.yellows.length && this.yellowAt(m.i)) {
      // amarilla: se levanta al pasar por la zona (doble: preparados para pararse)
      v = Math.min(v, this.track.vref[pi] * (this.yellowAt(m.i)!.double ? 0.82 : 0.93));
    }
    if (c.slowPuncture || c.tyres!.punctured) v = Math.min(v, 28);
    let move = v * dt;
    if (c.delay > 0) {
      // al que le están adelantando en una maniobra, el tiempo que pierde se le reparte más (van un rato en paralelo)
      const lose = Math.min(c.delay, dt * (c.passedIn ? MV_DELAY_RATE : 0.6));
      c.delay -= lose;
      move *= 1 - lose / dt;
    }
    c.v = v;
    const oldS = c.s;
    c.s += move;

    // en carrera, con el depósito medio vacío los neumáticos trabajan menos (hasta un ~6 % menos de energía al
    // final). Con el depósito lleno no se penaliza: las estrategias de la IA están calculadas sin este efecto y,
    // si las primeras tandas gastaran más de lo previsto, todo el mundo acababa parando una vez de más.
    const fuelK = isRaceKind(this.kind) ? Math.min(1, (MIN_MASS + c.fuel) / (MIN_MASS + 0.5 * this.fuelPerLap * this.laps)) : 1;
    // la energía va por segundo: con el recorte del modo de clasificación se tarda más en el tramo, pero lo que se
    // pierde es gestión de la energía del coche, no más trabajo del neumático (ni más recarga de la batería)
    const trimK = 1 + this.deployTrim(c) * this.trimW[m.i];
    const relE = (e: number) => (e / (this.tRef[m.i] * trimK)) * this.lapRefRace * fuelK;
    const slow = this.flag !== "green" ? 0.35 : ph.energy;
    // en aire sucio el morro pierde carga: el tren delantero desliza (subviraje), se recalienta y se rasga
    const wk = c.aheadId >= 0 ? wake(c.aheadDl ?? 0, WAKE_DIRTY) : 0;
    const dirty = c.aheadId >= 0 ? dirtyAir(c.followGap) * wk * m.aero * m.cornerSens * slow : 0;
    const tyres = c.tyres!;
    updateSet(tyres, {
      trackT: this.weather.trackT, airT: this.weather.airT, water,
      eF: relE(m.energyF) * slow * (c.followGap < 1.2 ? 1 + 0.12 * (1 - c.followGap / 1.2) * m.cornerSens * wk : 1),
      eR: relE(m.energyR) * slow,
      push: PUSH_ENERGY[c.push], carWear: c.wearMult * this.setupWear(c, m, water), abrasiveness: this.track.abrasiveness,
      rubber: this.rubber, slideF: 2 * dirty, slideR: 0.5 * dirty, rough: driverRough(c.d.neumaticos),
    }, dt, this.lapRefRace, this.hidden);
    // la telemetría mide la temperatura de la banda: cuánto rato pasa por encima del límite
    const heat = (c.tyreHeat ??= [0, 0]);
    const lim = blisterT(tyres.c);
    if (treadT(tyres.F) > lim) heat[0] += dt;
    if (treadT(tyres.R) > lim) heat[1] += dt;
    const underFlag = this.flag !== "green" || ph.speed < 1;
    c.fuel -= (this.fuelLap(c) * ENGINE_FUEL[c.engine] * PUSH_FUEL[c.push] * (underFlag ? 0.5 : 1) * move) / L;
    if (!underFlag) {
      const dE = this.ersLap * this.ersIn[m.i] - (this.ersLap - ERS_NET[c.ers]) * this.ersOut[m.i]; // MJ en este minisector
      c.soc = clamp(c.soc + (dE / (this.tRef[m.i] * trimK)) * dt, 0, SOC_MAX);
    } else c.soc = clamp(c.soc + (1.5 / this.lapRefRace) * dt, 0, SOC_MAX);
    // media de la última vuelta más o menos: es la que mira la IA para elegir modo, no el pico del momento
    c.socAvg = (c.socAvg ?? c.soc) + ((c.soc - (c.socAvg ?? c.soc)) * dt) / (this.lapRefRace * 0.6);
    if (c.fuel <= 0) { c.fuel = 0; this.retire(c, "sin combustible", 0.2, "failure"); return; }

    const wmax = setWear(c.tyres!);
    if (!c.tyres!.punctured && wmax > 0.96 && this.rng.chance(dt * 0.02 * (wmax - 0.95) * 20)) {
      c.tyres!.punctured = true;
      if (isRaceKind(this.kind) && !c.pitRequest) c.pitRequest = this.bestSetFor(c, this.avgWater() > WET.iw ? "W" : this.avgWater() > WET.si ? "I" : "M")?.id ?? null;
      if (c.run) c.run.phase = "in";
      this.log({ kind: "incident", text: `💥 ¡Pinchazo de ${c.d.abrev}! Vuelve a boxes.`, carId: c.id, important: true, pause: c.player, code: "pinchazo" });
    }

    const newK = Math.floor(c.s / L) * this.N + this.msIndexAt(c.s);
    if (c.s >= 0 && newK > c.msK) {
      for (let k = c.msK + 1; k <= newK; k++) {
        const bS = Math.floor(k / this.N) * L + this.track.ms[k % this.N].s0;
        const frac = clamp((bS - oldS) / Math.max(1e-6, c.s - oldS), 0, 1);
        c.cross[k] = this.t - dt + frac * dt;
        this.onMsEnter(c, k);
        if (c.loc !== "track") return;
      }
      c.msK = newK;
    }
    const prevPos = ((oldS % L) + L) % L;
    const newPos = ((c.s % L) + L) % L;
    const passedEntry = prevPos < this.track.pit.entry && (newPos >= this.track.pit.entry || newPos < prevPos);
    if (!c.pitRequest) { c.pitCallT = undefined; c.pitHold = undefined; }
    else if (c.pitCallT === undefined) c.pitCallT = this.t;
    if (passedEntry && oldS > 0) {
      if (isRaceKind(this.kind)) {
        if (c.pitRequest && !this.chequered) {
          // la parada pedida justo antes de la entrada no llega: el piloto ya no puede meterse
          if (c.player && !this.autoPlayers && this.t - c.pitCallT! < PIT_REACT) {
            c.pitCallT = this.t - PIT_REACT;
            this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "¡Demasiado tarde, ya he pasado la entrada! Paro en la siguiente."`, important: true, code: "tarde" });
          } else if (this.refusesStop(c)) {
            c.pitHold = true;
            this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "Una vuelta más, las gomas aguantan."`, important: true, code: "desobedece", n: 1 });
          } else this.enterPit(c, oldS);
        }
      } else if (c.run?.phase === "in") this.enterLaneIn(c);
    }
  }

  msIndexAt(s: number) {
    const pos = ((s % this.L) + this.L) % this.L;
    const pi = Math.min(this.track.msOfPoint.length - 1, Math.floor(pos / this.track.ds));
    return this.track.msOfPoint[pi];
  }

  /** Cronometraje por sectores (como en las pantallas de tiempos). */
  private sectorTiming(c: Car, k: number, ms: number) {
    const j = ms === this.secStart[1] ? 0 : ms === this.secStart[2] ? 1 : ms === 0 ? 2 : -1;
    if (j < 0) return;
    const back = j === 0 ? this.secStart[1] : j === 1 ? this.secStart[2] - this.secStart[1] : this.N - this.secStart[2];
    const t0 = c.cross[k - back];
    if (t0 === undefined || k - back < 0) { if (j === 2) { c.secLast = c.secCur; c.secCur = [NaN, NaN, NaN]; } return; }
    const st = c.cross[k] - t0;
    // solo cuentan las vueltas de verdad (no salida, enfriamiento ni entrada)
    const race = isRaceKind(this.kind);
    const counts = race ? this.lapsDone(c) >= 1 || j > 0 : (c.run?.phase === "push" || c.run?.phase === "long") && c.lapValid;
    if (race || counts) c.secCur[j] = st;
    if (counts) {
      if (st < c.secBest[j]) c.secBest[j] = st;
      if (st < this.secBest[j]) this.secBest[j] = st;
    }
    if (j === 2) {
      if (race || counts) c.secLast = c.secCur;
      if (race) c.lastLapValid = true;
      else if (c.run?.phase === "push" || c.run?.phase === "long") c.lastLapValid = c.lapValid;
      c.secCur = [NaN, NaN, NaN];
    }
  }

  private onMsEnter(c: Car, k: number) {
    const ms = k % this.N;
    const m = this.track.ms[ms];
    const qk = this.kind === "Q" || this.kind === "SQ" ? QUALI_NOISE : 1;
    const sigma = 0.0035 * qk * (1.25 - c.d.regularidad / 100) * (1 + this.water[ms] * 0.6);
    // cada coche aparta agua de la trazada: así se abre la línea seca
    if (this.water[ms] > 0) this.water[ms] *= 1 - CAR_DRY * Math.min(1, c.v / 60);
    if (ms === 0) c.lapNoise = this.rng.gauss(0, LAP_NOISE * qk * (1.25 - c.d.regularidad / 100) * (1 + this.water[ms] * 0.6));
    c.noise = this.rng.gauss(0, sigma) + (c.lapNoise ?? 0);
    this.sectorTiming(c, k, ms);

    if (ms === 0) {
      const lap = k / this.N;
      if (isRaceKind(this.kind)) this.raceLine(c, k, lap);
      else this.sessionLine(c, k);
      if (c.loc !== "track") return;
    }
    if (m.drsDetect) {
      c.drsEligible = isRaceKind(this.kind) && this.era.ayuda !== "ninguna" && this.flag === "green" && this.leaderLap + 1 >= this.drsEnabledFromLap && c.followGap < 1.0 && this.avgWater() < 0.35;
    }
    if (m.drs) c.drs = c.drsEligible;
    else if (!m.drsDetect) c.drs = false;

    if (isRaceKind(this.kind)) {
      // al simular hasta el final, el equipo también lleva a tus pilotos (con la estrategia elegida)
      if (ms === this.N - 3 && (!c.player || this.autoPlayers)) { aiDecide(this, c); aiModes(this, c, this.laps - this.lapsDone(c) - 1); }
      if (ms === this.N - 3 && c.player && !this.autoPlayers) this.playerAdvice(c);
      if (c.player && !this.autoPlayers) this.playerFight(c);
    }
    aiErs(this, c);
    if (this.flag !== "green") return;
    const pushing = !c.run || c.run.phase === "push" || c.run.phase === "long";
    // libres y clasificación: quien pasa en vuelta lanzada por una amarilla levanta y la vuelta se estropea
    if (!isRaceKind(this.kind) && c.run?.phase === "push" && this.yellows.length) {
      const y = this.yellowAt(ms);
      if (y && c.lastImpede !== -2 - ms) {
        c.lastImpede = -2 - ms;
        c.delay += y.double ? this.rng.range(0.8, 2) : this.rng.range(0.15, 0.4);
        if (c.player) this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "Amarilla${y.double ? " doble" : ""} en el sector ${m.sector + 1}, he tenido que levantar."`, important: y.double, code: "amarilla" });
      }
    }
    if (pushing) this.errorCheck(c, m);
    if (isRaceKind(this.kind)) {
      this.overtakeCheck(c, m);
      if (c.loc === "track" && m.cornerSens > 0.5 && this.rng.chance(TL_P * PUSH_ERR[c.push] * (1 + (85 - c.d.regularidad) / 40))) this.trackLimits(c, m);
      // con el coche más bajo de lo que pide el circuito, los bordillos castigan el fondo
      if (c.loc === "track" && m.cornerSens > 0.5 && c.setup) {
        const er = this.setupAt(c, m, this.water[m.i])!.er;
        if (er < -0.5 && this.rng.chance(KERB_P * (-er - 0.5))) this.damageFloor(c, this.rng.range(0.002, 0.006), "en un bordillo");
      }
    }
    // límites de pista en vuelta lanzada
    if (c.run?.phase === "push" && c.lapValid && m.cornerSens > 0.5 && this.rng.chance(0.001 * PUSH_ERR[c.push])) {
      c.lapValid = false;
      if (c.player || this.isTop(c)) this.log({ kind: "control", text: `🚩 Vuelta anulada a ${c.d.abrev}: límites de pista en el sector ${m.sector + 1}`, carId: c.id, important: c.player, code: "anulada" });
    }
  }

  private isTop(c: Car) { return this.timingOrder().indexOf(c) < 3; }

  // ------------------------------------------------------------ meta: carrera
  private raceLine(c: Car, k: number, lap: number) {
    if (lap >= 1) {
      const lt = c.cross[k] - c.lapStart;
      c.lapTimes.push(lt);
      // una vuelta imposible (cortada por una bandera roja o una salida parada) no cuenta como la mejor
      const real = lt > 0.85 * this.lapRefRace;
      if (lap > 1 && real && lt < c.best) { c.best = lt; c.bestTyre = c.tyres!.c; }
      if (lap > 1 && real && lt < this.bestLap) this.bestLap = lt;
      c.tyres!.laps++;
      c.lapStart = c.cross[k];
      // en carrera la pista también se engoma (si llovió por la mañana, sale verde y mejora vuelta a vuelta)
      this.rubber = Math.min(1, this.rubber + 0.0009);
      this.tyreLap(c);
      // una vuelta limpia: la confianza vuelve poco a poco (por encima de cero, también se va apagando)
      const cf = c.conf ?? 0;
      c.conf = cf < 0 ? Math.min(0, cf + 0.06) : cf * 0.95;
      // ¿sigue detrás del mismo coche sin poder pasarle?
      const ah = c.aheadId >= 0 && c.followGap < 1.0 && this.flag === "green" ? this.carById(c.aheadId) : null;
      if (ah && ah.loc === "track" && Math.abs(ah.s - c.s) < 200) c.stuck = { id: ah.id, n: c.stuck?.id === ah.id ? c.stuck.n + 1 : 1 };
      else c.stuck = undefined;
    }
    if (lap > this.leaderLap) {
      this.leaderLap = lap;
      this.onLeaderLap(lap);
    }
    if (this.chequered && lap >= 1) {
      this.finishCar(c, c.cross[k]);
      if (c.player) this.log({ kind: "info", text: `🏁 ${c.d.abrev} termina P${this.order().indexOf(c) + 1}`, carId: c.id, important: true, code: "meta", n: this.order().indexOf(c) + 1 });
      return;
    }
    this.lapChecks(c, lap);
  }

  private onLeaderLap(lap: number) {
    if (this.flag === "green") this.greenLeaderLaps++;
    if (this.probes.length) this.stewards();
    this.lapOrder[lap] = this.order().filter((c) => c.loc !== "out").map((c) => c.id);
    for (const f of this.onLap) f(lap);
    // reglamento: 2 h de carrera (sin contar las suspensiones) y 3 h en total; al cumplirse, bandera
    // a cuadros al final de la vuelta en la que se agota el tiempo
    if (!this.chequered && lap < this.laps && (this.wall - this.suspended >= RACE_MAX || this.wall >= RACE_WINDOW)) {
      this.laps = lap;
      this.log({ kind: "control", text: `⏱️ Se cumple el tiempo máximo de carrera: bandera a cuadros en la vuelta ${lap}`, important: true });
    }
    if (lap >= this.laps && !this.chequered) {
      this.chequered = true;
      this.log({ kind: "control", text: "🏁 Bandera a cuadros", important: true, code: "cuadros" });
      return;
    }
    if (this.flag === "sc" && this.scWet && this.avgWater() > WET_SC_END) {
      // sigue demasiado mojado: el coche de seguridad no se retira
      if (lap % 2 === 0) this.log({ kind: "control", text: `🟨 Sigue el coche de seguridad: agua ${this.avgWater().toFixed(1)} mm`, important: false });
    } else if (this.flag === "sc") {
      this.scLapsLeft--;
      if (this.scLapsLeft <= 0) {
        // antes de retirarse, los doblados pueden desdoblarse: una vuelta más (dos si tardan en llegar a la cola)
        const lapped = this.lappedCars();
        if (!this.unlapCalled && lapped.length && this.laps - lap > 3) {
          this.unlapCalled = true;
          for (const c of lapped) c.unlap = true;
          this.scLapsLeft = 1;
          this.log({ kind: "control", text: `🟨 Los doblados pueden desdoblarse (${lapped.map((c) => c.d.abrev).join(", ")})`, important: lapped.some((c) => c.player), code: "desdoblar" });
        } else if (this.cars.some((c) => c.unlap) && this.unlapWait < 1) {
          this.unlapWait++;
          this.scLapsLeft = 1;
        } else if (this.standAfterSc && this.laps - lap > 3) {
          // tras la bandera roja por lluvia: en vez de lanzada, todos a la parrilla y salida parada
          this.standAfterSc = false;
          for (const c of this.cars) c.unlap = undefined;
          this.flag = "green";
          this.scWet = false;
          this.unlapCalled = false;
          this.unlapWait = 0;
          this.standingRestart();
        } else {
          this.standAfterSc = false;
          for (const c of this.cars) c.unlap = undefined;
          this.flag = "sc_in";
          // el líder elige dónde acelerar: en el último tramo, unos antes y otros apurando hasta cerca de la meta
          this.scGo = { at: this.rng.range(140, Math.max(260, Math.min(this.L * 0.2, 900))), t: null };
          this.log({ kind: "control", text: "🟨 El coche de seguridad entra al final de esta vuelta", important: true });
        }
      }
    } else if (this.flag === "sc_in") {
      this.flag = "green";
      this.scWet = false;
      this.scGo = null;
      this.unlapCalled = false;
      this.unlapWait = 0;
      for (const c of this.cars) { c.scGoT = undefined; c.unlap = undefined; }
      this.drsEnabledFromLap = lap + 3;
      this.log({ kind: "control", text: "🟢 ¡Relanzada! Bandera verde.", important: true, pause: true, code: "verde" });
    }
    // mucha agua pero sin llegar a bandera roja: coche de seguridad
    if (this.avgWater() > 1.8 && this.flag === "green") { this.deploy("sc", "demasiada agua en pista", 0.4); this.scWet = true; }
    for (const c of this.cars) {
      if (c.loc !== "track") continue;
      if (c.fault) { this.faultLap(c); continue; }
      // la fiabilidad de cada equipo pesa mucho: los coches frágiles se rompen bastante más que los buenos
      const hz = (1 / FAIL_LAPS) * Math.pow(c.team.fiabilidad, 2.5) * ENGINE_FAIL[c.engine] * (1 + c.floor * 5);
      if (c.e.pu) {
        // con unidades de potencia: la mitad de las averías son del motor y crecen con su desgaste
        if (this.rng.chance(hz * 0.5 * puHazard(puLife(c.e.pu.km0 + c.puKm)))) {
          this.fault(c, this.rng.pick(["motor", "unidad de potencia", "MGU-K", "batería"]), true);
        } else if (this.rng.chance(hz * 0.5)) {
          this.fault(c, this.rng.pick(["caja de cambios", "hidráulica", "fallo eléctrico", "frenos"]), false);
        }
      } else if (this.rng.chance(hz)) {
        this.fault(c, this.rng.pick(["motor", "caja de cambios", "hidráulica", "fallo eléctrico", "frenos", "batería"]), false);
      }
    }
  }

  /**
   * Al cerrar cada vuelta: lo que nota el piloto y lo que ve la telemetría. Nadie mide el graining ni las
   * ampollas directamente: el piloto nota el graining (subviraje, el coche «flota»), con más o menos
   * acierto según lo fino que sea; las ampollas no se notan hasta que hay vibraciones, y la telemetría
   * solo avisa de que la banda va pasada de temperatura (riesgo). Se confirman al ver el juego.
   */
  private tyreLap(c: Car) {
    const t = c.tyres;
    if (!t) return;
    let f = c.tyreFeel;
    if (!f || f.set !== t.id) f = c.tyreFeel = { set: t.id, grain: [0, 0], blister: [0, 0], risk: [false, false] };
    const heat = c.tyreHeat ?? [0, 0];
    c.tyreHeat = [0, 0];
    const sd = clamp(0.05 + (95 - c.d.neumaticos) / 250, 0.04, 0.2);
    const say = (text: string, important = false) => { if (c.player) this.log({ kind: "radio", carId: c.id, text, important }); };
    const AX = ["delanteros", "traseros"];
    for (let k = 0; k < 2; k++) {
      const a = k === 0 ? t.F : t.R;
      // graining: el piloto lo nota; se informa cuando empeora un escalón o cuando desaparece
      const g = a.grain + this.rng.gauss(0, sd);
      const lvl = g < 0.12 ? 0 : g < 0.3 ? 1 : g < 0.55 ? 2 : 3;
      if (lvl > f.grain[k]) {
        const cold = treadT(a) < grainT(t.c);
        if (lvl >= 2) say(`📻 ${c.d.abrev}: "Graining ${GRAIN_WORDS[lvl]} en los ${AX[k]}, el coche no gira."${cold ? " Ingeniero: les falta temperatura, hay que calentarlos." : " Ingeniero: ya están en temperatura, se limpiará en unas vueltas."}`, lvl >= 3);
        f.grain[k] = lvl;
      } else if (lvl < f.grain[k] - 1 || (lvl === 0 && f.grain[k] > 0)) {
        if (f.grain[k] >= 2 && lvl <= 1) say(`📻 ${c.d.abrev}: "Los ${AX[k]} ya se han limpiado, vuelven a agarrar."`);
        f.grain[k] = lvl;
      }
      // riesgo de ampollas: la telemetría ve la banda pasada de temperatura un buen rato de la vuelta,
      // dos vueltas seguidas (un bloqueo o una vuelta lanzada sueltos no lo son)
      const hotLaps = (f.hotLaps ??= [0, 0]), warned = (f.warned ??= [false, false]);
      hotLaps[k] = heat[k] > 3 ? hotLaps[k] + 1 : 0;
      f.risk[k] = hotLaps[k] >= 2;
      if (f.risk[k] && !warned[k] && f.blister[k] === 0 && !isQualiKind(this.kind) && c.run?.kind !== "quali") {
        warned[k] = true;
        say(`📻 Ingeniero: ${c.d.abrev}, temperatura de banda muy alta en los ${AX[k]}. Riesgo de ampollas: hay que bajar el ritmo.`, true);
      }
      // ampollas: con vibraciones las nota el piloto; las confirman en las imágenes y en la telemetría
      const b = a.blister + this.rng.gauss(0, sd);
      if (f.blister[k] === 0 && b > 0.3) {
        f.blister[k] = 1;
        say(`📻 ${c.d.abrev}: "Noto vibraciones en los ${AX[k]}… ¿ampollas?"`, true);
      } else if (f.blister[k] === 1 && a.blister > 0.45 && this.rng.chance(0.5)) {
        f.blister[k] = 2;
        say(`📻 Ingeniero: confirmado, ${c.d.abrev} tiene ampollas en los ${AX[k]}. Van a caer rápido.`, true);
      }
    }
  }

  /** Al quitar un juego, los mecánicos lo miran: ahí se ve de verdad el graining y las ampollas. */
  private inspect(c: Car, t: TyreSet) {
    const r2 = (x: number) => Math.round(x * 100) / 100;
    t.insp = { grain: [r2(t.F.grain), r2(t.R.grain)], blister: [r2(t.F.blister), r2(t.R.blister)] };
    if (!c.player) return;
    const AX = ["delanteros", "traseros"];
    const bits: string[] = [];
    for (let k = 0; k < 2; k++) {
      if (t.insp.blister[k] >= 0.1) bits.push(`ampollas en los ${AX[k]} (${Math.round(t.insp.blister[k] * 100)} %)`);
      if (t.insp.grain[k] >= 0.15) bits.push(`graining en los ${AX[k]} (${Math.round(t.insp.grain[k] * 100)} %)`);
    }
    if (bits.length) this.log({ kind: "radio", carId: c.id, text: `🔍 Mecánicos, juego ${t.id} de ${c.d.abrev}: ${bits.join(", ")}.` });
  }

  private lapChecks(c: Car, lap: number) {
    if (!c.player || !c.tyres) return;
    const t = c.tyres;
    const wear = setWear(t);
    const sp = COMPOUNDS[t.c];
    // un aviso por juego: si el jugador decide seguir, no se le para la carrera en cada vuelta
    if (wear > sp.cliff - 0.06 && wear < sp.cliff + 0.02 && !c.pitRequest && c.cliffWarned !== t.id) {
      c.cliffWarned = t.id;
      this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "Los neumáticos se están acabando, noto cómo caen."`, pause: true, important: true, code: "gomas" });
    }
    const lapsLeft = this.laps - lap;
    const fuelLaps = c.fuel / this.fuelLap(c);
    // regla de los dos compuestos: se avisa a tiempo de parar (y otra vez al final)
    if (this.kind === "RACE" && !this.autoPlayers && (lapsLeft === 12 || lapsLeft === 4) && !ruleSatisfied(c))
      this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev} aún no ha usado un segundo compuesto de seco. Si no para a montar otro, le descalifican.`, important: true, pause: true });
    if (lapsLeft > 3 && fuelLaps < lapsLeft - 0.3 && lap % 3 === 0) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev} va ${(lapsLeft - fuelLaps).toFixed(1)} vueltas corto de combustible. Hay que ahorrar.`, important: true });
  }

  private playerAdvice(c: Car) {
    if (c.pitRequest) return;
    const sugg = aiDecide(this, c, true);
    const lap = this.lapsDone(c);
    if (sugg && c.advice && this.carSetCompound(c, c.advice.setId) === this.carSetCompound(c, sugg) && lap - c.advice.lap < 3) return;
    if (sugg) {
      c.advice = { lap, setId: sugg };
      const set = c.e.sets.find((s) => s.id === sugg)!;
      this.log({ kind: "radio", carId: c.id, text: `🧠 Estratega: ${c.d.abrev}, recomendaría parar ESTA vuelta y montar ${COMPOUNDS[set.c].name.toLowerCase()} (${set.laps ? `usado, ${set.laps} v` : "nuevo"})${c.adviceWhy ? `: ${c.adviceWhy}` : ""}.`, pause: true, important: true, code: "estratega" });
    }
  }
  private carSetCompound(c: Car, id: string) { return c.e.sets.find((s) => s.id === id)?.c; }

  /** El mejor juego disponible de un compuesto (nuevo primero, luego el menos gastado). */
  bestSetFor(c: Car, comp: Compound): TyreSet | undefined {
    return c.e.sets.filter((s) => s.c === comp && !s.returned && s !== c.tyres && !s.punctured).sort((a, b) => setWear(a) - setWear(b))[0];
  }

  // ------------------------------------------------------ meta: libres / Q
  private sessionLine(c: Car, k: number) {
    const run = c.run;
    if (!run) return;
    c.tyres!.laps++;
    c.sessionLaps++;
    this.tyreLap(c);
    this.rubber = Math.min(1, this.rubber + (this.kind.startsWith("FP") ? RUBBER_FP_LAP : 0.0009));
    const wasPush = run.phase === "push" || run.phase === "long";
    // vuelta estropeada (anulada, o con una salida de pista o un bloqueo): si da tiempo, la IA lo vuelve a intentar
    const ruined = run.phase === "push" && c.lapStart > 0 && (!c.lapValid || (!!c.fx && c.fx.t > c.lapStart));
    if (wasPush && c.lapStart > 0) {
      const lt = c.cross[k] - c.lapStart;
      c.lapTimes.push(lt);
      run.lapsData.push(lt);
      if (c.lapValid) {
        const p = this.part;
        const prevBest = c.bestByPart[p] ?? Infinity;
        if (lt < c.best) { c.best = lt; c.bestTyre = c.tyres!.c; c.bestSecs = [...c.secLast]; }
        if (lt < this.bestLap) this.bestLap = lt;
        if (lt < prevBest) {
          c.bestByPart[p] = lt; c.bestTyreByPart[p] = c.tyres!.c; c.bestSecsByPart[p] = [...c.secLast];
          c.bestEvo = { part: p, evo: this.qualiEvo(), wear: setWear(c.tyres!) };
          c.bestWaterByPart[p] = ((c.lapW0 ?? this.avgWater()) + this.avgWater()) / 2;
        }
        if (run.phase === "push") this.lapRadio(c, lt);
      } else if (c.player) {
        this.log({ kind: "info", text: `${c.d.abrev}: vuelta de ${fmt(lt)} anulada`, carId: c.id });
      }
      run.done++;
    }
    c.lapStart = c.cross[k];
    c.lapW0 = this.avgWater();
    c.lapValid = true;
    // fase siguiente
    if (run.phase === "out") run.phase = run.kind === "long" ? "long" : run.kind === "inst" ? "in" : "push";
    else if (run.phase === "push") {
      const lapT = c.lapTimes[c.lapTimes.length - 1] ?? this.track.refLap;
      // sin un tiempo que valga y con reloj para una de enfriamiento y otra lanzada: se queda fuera
      if (ruined && run.kind === "quali" && c.auto && run.done >= run.pushLaps && run.pushLaps < 4 && this.remaining() > lapT * 2.3 && !c.tyres!.punctured && this.retryWorthIt(c)) run.pushLaps++;
      if (run.done >= run.pushLaps || this.remaining() <= 0) run.phase = "in";
      // en mojado se encadenan las vueltas; en seco, a veces dos seguidas
      else run.phase = run.kind === "quali" && run.pushLaps > 1 && (this.avgWater() > WET.si * 0.5 || this.rng.chance(0.5)) ? "push" : "cool";
      // la lluvia arrecia: si con la pista como va a estar ya no puede bajar su tiempo, a boxes a guardar las gomas
      if (run.phase === "push" && run.kind === "quali" && c.auto && !qualiCanImprove(this, c, 0, this.retryWorthIt(c))) run.phase = "in";
    } else if (run.phase === "cool") run.phase = this.remaining() > 0 ? "push" : "in";
    else if (run.phase === "long" && (run.done >= run.pushLaps || this.remaining() <= 0)) run.phase = "in";
    // con slicks y pista mojada (o con neumáticos de lluvia en seco) no tiene sentido seguir
    if (run.phase !== "in" && wrongTyresForWater(this, c)) {
      if (c.auto) {
        run.phase = "in";
        if (c.player) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev}, entra; con ${DRY.includes(c.tyres!.c) ? "esta agua los slicks no sirven" : "la pista seca los de lluvia se destrozan"}.`, important: true, code: "agua" });
        // en clasificación, vuelve a salir en cuanto pueda con el neumático adecuado
        if (this.parts.length && c.qPlan) c.qPlan.deps.unshift(this.remaining() - 20);
      } else if (!c.wetWarned) {
        c.wetWarned = true;
        this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev}, ${DRY.includes(c.tyres!.c) ? "la pista está mojada para slicks" : "la pista se está secando"}. ¿Entramos?`, important: true, pause: true, code: "aguaPregunta" });
      }
    }
    // la vuelta lanzada que empieza con el reloj a cero no cuenta
    if ((run.phase === "push" || run.phase === "long") && this.remaining() <= 0) run.phase = "in";
    if (run.phase === "push") c.push = 4;
    else if (run.phase === "long") c.push = 2;
  }

  /** Clasificación: ¿merece la pena otra vuelta con este juego tras estropear la anterior? */
  private retryWorthIt(c: Car): boolean {
    const part = this.parts[this.part];
    if (!part) return false;
    const best = c.bestByPart[this.part] ?? Infinity;
    if (!isFinite(best)) return true;
    if (part.advance === null) return true;
    const pos = this.timingOrder().filter((x) => !x.eliminated).indexOf(c);
    return pos >= part.advance - 3;
  }

  private lapRadio(c: Car, lt: number) {
    const ord = this.timingOrder();
    const pos = ord.indexOf(c) + 1;
    const p1 = ord[0];
    const pb = p1 === c ? "" : ` (+${(lt - (this.parts.length ? p1.bestByPart[this.part] : p1.best)).toFixed(3)})`;
    const purple = p1 === c && lt === (this.parts.length ? c.bestByPart[this.part] : c.best);
    if (c.player || pos <= 3) this.log({ kind: "info", text: `⏱️ ${c.d.abrev} ${fmt(lt)} — P${pos}${purple ? " 🟪" : pb}`, carId: c.id, important: c.player, code: "vuelta", n: pos });
  }

  /** Lógica de sesión: salidas de garaje, reloj, partes de la clasificación. */
  private sessionTick() {
    if (this.flag === "red") return;
    // salidas programadas / IA
    for (const c of this.cars) {
      if (c.loc !== "garage" || c.eliminated) continue;
      if (this.remaining() <= 0) continue;
      if (this.parts.length) { if (c.auto) qualiTick(this, c); }
      else if (c.queue.length) {
        const next = c.queue[0];
        if ((next.at ?? 0) <= this.partT) {
          c.queue.shift();
          if (!c.auto) { this.startRun(c, next); continue; }
          // el equipo mira la pista antes de salir
          const d = practiceWeather(this, c, next);
          if (!d) continue;
          if ("wait" in d) {
            c.queue.unshift({ ...next, at: this.partT + d.wait });
            for (let i = 1; i < c.queue.length; i++) c.queue[i].at = Math.max(c.queue[i].at ?? 0, (c.queue[i - 1].at ?? 0) + 60);
            continue;
          }
          this.startRun(c, d.run);
        }
      }
    }
    // fin de la sesión / parte
    if (this.remaining() <= 0 && !this.chequered) {
      this.chequered = true;
      this.log({ kind: "control", text: `🏁 Bandera a cuadros${this.parts.length ? ` en ${this.parts[this.part].name}` : ""}`, important: true, code: "cuadros" });
      for (const c of this.cars) {
        if (c.loc === "lane_out") this.toGarage(c);
        else if (c.run && c.run.phase !== "push" && c.run.phase !== "long") c.run.phase = "in";
      }
    }
    if (this.chequered && this.cars.every((c) => c.loc === "garage" || c.loc === "out")) this.endPart();
  }

  startRun(c: Car, run: Run) {
    if (c.loc !== "garage" || this.flag === "red" || this.remaining() <= 0) return false;
    const set = c.e.sets.find((s) => s.id === run.setId && !s.returned);
    if (!set) return false;
    const part = this.parts[this.part];
    if (part?.compound && set.c !== part.compound && this.avgWater() < WET.si) return false;
    this.mount(c, set);
    c.fuel = run.fuel;
    c.run = { ...run, phase: "out", done: 0, startT: this.t, lapsData: [] };
    c.wetWarned = false;
    c.loc = "lane_out";
    c.lane = { t: 0, total: (this.track.pit.laneLength / this.track.pit.limit) * (1 - this.garageAt(c)) };
    c.gapWant = this.rng.chance(0.15) ? 0 : this.towTrack ? this.outLapGap + this.rng.range(-0.15, 0.4) : this.outLapGap * this.rng.range(0.7, 1.5);
    c.push = 2;
    c.wing = 0;
    c.slowPuncture = false;
    return true;
  }

  private laneStep(c: Car, dt: number) {
    const l = c.lane!;
    l.t += dt;
    c.v = this.track.pit.limit;
    if (l.t < l.total) return;
    if (c.loc === "lane_out") {
      // al final del pit-lane se sale de uno en uno
      if (this.t - this.lastPitExit < 1.2) return;
      this.lastPitExit = this.t;
      c.loc = "track";
      const base = (Math.floor(Math.max(0, c.s) / this.L) + 1) * this.L;
      c.s = base + this.track.pit.exit;
      c.msK = Math.floor(c.s / this.L) * this.N + this.msIndexAt(c.s);
      c.lapStart = 0;
      c.lapValid = true;
    } else this.toGarage(c);
  }

  private enterLaneIn(c: Car) {
    c.loc = "lane_in";
    c.lane = { t: 0, total: (this.track.pit.laneLength / this.track.pit.limit) * this.garageAt(c) };
  }

  /** Posición del garaje en el pit-lane (0 = entrada, 1 = salida): por el orden de los equipos. */
  garageAt(c: Car): number {
    const teams = [...new Set(this.cars.map((x) => x.team.id))];
    return 0.12 + (0.76 * teams.indexOf(c.team.id)) / Math.max(1, teams.length - 1);
  }

  toGarage(c: Car) {
    const run = c.run;
    if (c.tyres) this.inspect(c, c.tyres);
    if (run && c.tyres) {
      c.tyres.laps++;
      if (run.kind === "long" || run.lapsData.length >= 3) learnFromRun(this, c, run);
      if (run.kind === "long" && run.lapsData.length >= 4) this.recordLongRun(c, run.lapsData, run.fuel, c.tyres.c);
    }
    c.loc = "garage";
    c.run = undefined;
    c.tyres = null;
    c.v = 0;
    c.followGap = 99;
    c.aheadId = -1;
  }

  /** Resume una tanda larga: vueltas corregidas a depósito vacío, media sin las raras y pendiente. */
  private recordLongRun(c: Car, laps: number[], fuel0: number, comp: Compound) {
    const kgSens = this.track.ms.reduce((a, m) => a + m.dMass, 0); // s por kg
    // combustible al empezar cada vuelta lanzada (la de salida ya ha gastado una)
    const corr = laps.map((t, i) => t - kgSens * Math.max(0, fuel0 - this.fuelPerLap * (i + 1)));
    const sorted = [...corr].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const pts = corr.map((t, i) => [i, t] as const).filter(([, t]) => t < med * 1.025);
    if (pts.length < 3) return;
    const n = pts.length, mx = pts.reduce((a, [i]) => a + i, 0) / n, my = pts.reduce((a, [, t]) => a + t, 0) / n;
    const sxy = pts.reduce((a, [i, t]) => a + (i - mx) * (t - my), 0), sxx = pts.reduce((a, [i]) => a + (i - mx) ** 2, 0);
    this.longRuns.push({ id: c.id, c: comp, n: laps.length, avg: my, deg: sxx ? sxy / sxx : 0, wet: this.avgWater() > WET.si * 0.6 });
  }

  /** Vuelve a boxes (el jugador aborta). */
  abortRun(c: Car) {
    if (c.run) c.run.phase = "in";
  }

  private endPart() {
    if (!this.parts.length) {
      this.finished = true;
      this.log({ kind: "control", text: `🏁 ${SESSION_NAMES[this.kind]} terminada`, important: true, pause: true });
      return;
    }
    const part = this.parts[this.part];
    const ord = this.timingOrder().filter((c) => !c.eliminated);
    if (part.advance !== null) {
      ord.forEach((c, i) => {
        if (i >= part.advance!) {
          c.eliminated = true;
          c.elimPart = this.part;
          if (c.player) this.log({ kind: "info", text: `❌ ${c.d.abrev} eliminado en ${part.name} (P${i + 1})`, carId: c.id, important: true, code: "eliminado", n: i + 1 });
        }
      });
      const out = ord.slice(part.advance).map((c) => c.d.abrev).join(", ");
      this.log({ kind: "control", text: `Eliminados en ${part.name}: ${out}`, important: true, pause: true, code: "eliminados" });
      this.inBreak = this.breaks[this.part] * 60;
      this.part++;
      this.chequered = false;
      this.partT = 0;
      this.durationS = this.parts[this.part].minutes * 60;
    } else {
      this.finished = true;
      const pole = ord[0];
      this.log({ kind: "control", text: `🏆 POLE para ${pole.d.nombre} (${pole.team.nombre}) ${fmt(pole.bestByPart[this.part])}`, important: true, pause: true, code: "pole", carId: pole.id });
    }
  }

  private startPart() {
    this.inBreak = 0;
    this.log({ kind: "control", text: `🟢 Empieza la ${this.parts[this.part].name}`, important: true, pause: true, code: "empieza" });
  }

  // ------------------------------------------------------------ incidencias
  private errorCheck(c: Car, m: Minisector) {
    if (m.cornerSens < 0.35) return;
    const water = this.water[m.i];
    const tyres = c.tyres!;
    const sp = COMPOUNDS[tyres.c];
    const coldF = Math.max(0, sp.opt - 20 - tyres.F.tBulk) / 20;
    // agarre frente al que daría el neumático adecuado para esa agua (slicks en mojado, gastados...)
    const deficit = Math.max(0, 0.9 - setGrip(tyres, water) / (sp.base * bestWaterGrip(water))) * 5;
    let p = 1.1e-4 * PUSH_ERR[c.push] * (1 + (85 - c.d.regularidad) / 25) * (1 + deficit + coldF);
    if (c.fault?.what === "frenos") p *= 1 + 2 * c.fault.lvl;
    p *= 1 + 5 * Math.min(1.2, water) * (1.3 - c.d.lluvia / 100) * (1 + 0.5 * this.greenness(c));
    // los novatos fallan algo más; con la confianza por los suelos, también
    p *= (1 + 0.15 * this.greenness(c)) * (1 - 0.35 * (c.conf ?? 0));
    const wind = windNow(this.weather).speed;
    if (wind > 25) p *= 1 + ((wind - 25) / 25) * m.aero;
    if (isRaceKind(this.kind)) {
      if (this.lapsDone(c) === 0) p *= 2;
      // con uno pegado detrás se cometen más errores (los regulares, casi ninguno más); pegado al de delante, también
      const pr = clamp((0.9 - (c.chased ?? 99)) / 0.7, 0, 1);
      p *= 1 + pr * 3.2 * (1.25 - c.d.regularidad / 100);
      if (c.aheadId >= 0 && c.followGap < 0.6) p *= 1.25;
    }
    if (!this.rng.chance(p * m.cornerSens * 2)) return;
    const r = this.rng.next();
    const ro = this.runoffAt(c);
    const crashP = (CRASH_P + 0.06 * Math.min(1, water)) * (1.5 - Math.min(26, ro) / 26) / RUNOFF_NORM;
    if (r < crashP) {
      c.fx = { k: "crash", t: this.t };
      this.retire(c, "accidente", 0.7);
    } else if (r < crashP + 0.2) {
      const loss = this.rng.range(1.8, 6);
      c.delay += loss;
      c.lapValid = false;
      let dmg = "";
      if (this.rng.chance(0.15)) { c.wing += this.rng.range(0.008, 0.03); dmg = " y daña el alerón"; }
      else if (this.rng.chance(0.25 * (ro > 8 ? 1.5 : ro < 3 ? 0.55 : 1))) { this.damageFloor(c, this.rng.range(0.002, 0.008), "por la grava"); dmg = " y daña el fondo"; }
      // los que más tiempo pierden son los que han trompeado (solo cambia el texto y el dibujo)
      const spin = loss > 3.6;
      this.stats.offs++;
      // tras un error, unos se vienen abajo más que otros
      this.shake(c, 0.15 + (95 - c.d.regularidad) / 80 + (spin ? 0.1 : 0));
      c.fx = { k: spin ? "spin" : "off", t: this.t, loss };
      // se va de verdad por fuera de la curva (y vuelve): lo que hace la posición lateral
      c.offWide = { side: this.outsideAt(c), until: this.t + Math.min(OFF_T, 0.6 * loss) };
      // el trompo deja amarilla doble un rato (en clasificación, vuelta estropeada al que pase); la salida, simple
      this.yellows.push({ ms: m.i, until: this.t + this.rng.range(15, 35), double: spin });
      if (!isRaceKind(this.kind)) this.log({ kind: "control", text: `⚠️ Bandera amarilla${spin ? " doble" : ""} en el sector ${m.sector + 1}: ${spin ? "trompo" : "salida de pista"} de ${c.d.abrev}`, code: "banderaAmarilla" });
      this.log({ kind: "incident", text: spin ? `🌀 ${c.d.abrev} hace un trompo en el sector ${m.sector + 1}${dmg} (−${loss.toFixed(1)} s)` : `↩️ ${c.d.abrev} se sale de pista en el sector ${m.sector + 1}${dmg} (−${loss.toFixed(1)} s)`, carId: c.id, important: c.player, code: spin ? "trompo" : "salida" });
    } else if (r < crashP + 0.35) {
      c.fx = { k: "lock", t: this.t };
      c.delay += this.rng.range(0.3, 0.8);
      this.shake(c, 0.08);
      tyres.flatSpot = Math.min(1, tyres.flatSpot + this.rng.range(0.3, 0.8));
      // la rueda bloqueada arrastra goma por el asfalto: pico de temperatura en la superficie (que con
      // la carcasa caliente puede iniciar ampollas) y banda que se va en ese punto
      tyres.F.tSurf += this.rng.range(30, 70);
      tyres.F.wear = Math.min(1, tyres.F.wear + this.rng.range(0.004, 0.012));
      if (c.player) this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "He bloqueado, tengo un plano en el delantero."`, code: "plano" });
    } else {
      c.delay += this.rng.range(0.15, 0.6);
    }
  }

  private overtakeCheck(c: Car, m: Minisector) {
    if (c.aheadId < 0 || c.followGap > PASS_REACH) return;
    if (this.yellows.length && this.yellowAt(m.i)) return;
    const a = this.carById(c.aheadId);
    if (a === c || a.loc !== "track") return;
    if (c.grant === a.id && this.t < c.grantUntil) return;
    const lapped = this.lapsDone(c) > this.lapsDone(a) || c.s - a.s > this.L * 0.5;
    if (a.s - c.s > this.L * 0.5) return;
    if (lapped) {
      // banderas azules: de vez en cuando un doblado no hace caso (más los agresivos y los novatos) y aguanta un rato
      // al que le dobla; los comisarios le ponen 5 s. Con su propio azar: sin ninguna, la carrera es la misma.
      if (a.blueFor !== c.id) {
        a.blueFor = c.id;
        a.blueHold = undefined;
        if (isRaceKind(this.kind) && this.blueRoll(BLUE_IGNORE_P * (0.6 + a.d.agresividad / 100) * (1 + 0.6 * this.greenness(a)))) {
          a.blueHold = this.t + 12 + 10 * this.blueRoll(1, true);
          this.log({ kind: "control", carId: a.id, text: `🔵 ${a.d.abrev} no hace caso a las banderas azules y aguanta a ${c.d.abrev}`, important: a.player || c.player, code: "azules", other: c.id });
          this.penalize(a, 5, "ignorar las banderas azules", "azules");
        }
      }
      if (a.blueHold !== undefined && this.t < a.blueHold) return;
      // el doblado se aparta (y pierde tiempo) y el que dobla también levanta algo al pasarle
      if (this.rng.chance(0.55)) { this.grantPass(c, a, this.rng.range(0.2, 0.6)); c.delay += this.rng.range(0.05, 0.25); this.startBlue(c, a); }
      return;
    }
    if (a.team === c.team && a.letPass === c.id) {
      this.grantPass(c, a, 0.4);
      a.letPass = undefined;
      this.log({ kind: "info", text: `🔁 ${a.d.abrev} deja pasar a ${c.d.abrev}`, carId: c.id });
      return;
    }
    const lap1 = this.lapsDone(c) === 0;
    // recién adelantado: sale de la frenada fuera de la trazada y sin tracción, no puede devolverla enseguida
    if (c.passedBy && c.passedBy.id === a.id && this.t - c.passedBy.t < 7) return;
    // dónde: una zona de frenada; en la primera vuelta, cualquier curva (van en grupo y con los neumáticos fríos);
    // fuera de las zonas solo en curvas y con una ventaja enorme (un coche con los neumáticos muertos no aguanta)
    let zone = m.overtake, extra = 0;
    if (lap1 && m.cornerSens > 0.3 && c.s < this.L * 0.4) zone = Math.max(zone, 0.2);
    if (zone <= 0) { if (lap1 || m.cornerSens < 0.45) return; extra = PASS_ANY; } else extra += (1 - zone) * PASS_ZONE;
    const water = this.water[m.i];
    // el que ataca sale de la trazada: si se ha abierto línea seca, pisa más agua
    const wAtt = water + 0.6 * Math.max(0, this.waterOff[m.i] - water);
    // agarre de cada uno en aire limpio (el aire sucio ya ha hecho su trabajo: no dejarle acercarse)
    // (los dos por la trazada: abrirse o no en la curva anterior no cambia lo que agarran en la frenada)
    const clean = (x: Car, w: number) => { const fg = x.followGap, o = x.offLine; x.followGap = 99; x.offLine = 0; const g = this.msTime(x, m, w).grip; x.followGap = fg; x.offLine = o; return g; };
    // (en la primera vuelta van en grupo y con las gomas a medio calentar: la diferencia de agarre cuenta la mitad)
    const grip = clamp((clean(c, wAtt) / clean(a, water) - 1) * 100 * this.secPerGrip, -3, 5) * (lap1 ? 0.5 : 1);
    // la recta anterior, cada uno con lo que llevaba: rebufo, modo adelantamiento (también el de delante si va en tren),
    // batería, motor, resistencia y peso
    const prev = this.track.ms[(m.i - 1 + this.N) % this.N];
    // (el que va a atacar se mete detrás en la recta a por el rebufo, aunque viniera abierto de la curva anterior)
    const onStraight = (x: Car) => { const d = x.drs, dl = x.aheadDl, o = x.offLine; x.drs = x.drsEligible && prev.drs; if (x === c) { x.aheadDl = 0; x.offLine = 0; } const t = this.msTime(x, prev, this.water[prev.i]).t; x.drs = d; x.aheadDl = dl; x.offLine = o; return t; };
    const straight = onStraight(a) - onStraight(c);
    const skill = (c.d.ataque - a.d.defensa) / 100;
    const hardC = this.hard(c), hardA = this.hard(a);
    const adv = grip + PASS_KS * straight + skill + (hardC ? RISK_ADV : 0);
    const near = clamp((PASS_REACH - c.followGap) / (PASS_REACH - 0.2), 0.25, 1);
    // el de delante puede no pelear (deja pasar al que va más rápido) o cerrar la puerta (cuesta tiempo y gomas)
    const mode = this.fightMode(a);
    if (mode === "yield" && adv > 0 && !lap1) {
      this.grantPass(c, a, this.rng.range(0.15, 0.3));
      const outside = this.startManeuver(c, a, true);
      c.passLog = { a: a.id, until: this.t + 10, outside };
      a.passedBy = { id: c.id, t: this.t };
      c.stuck = undefined;
      return;
    }
    const defend = mode === "defend";
    if (defend) {
      a.delay += this.rng.range(0.03, 0.09);
      a.tyres!.F.tSurf += this.rng.range(2, 5);
      a.tyres!.F.wear = Math.min(1, a.tyres!.F.wear + 0.0004);
    }
    const will = 1 / (1 + Math.exp(-(adv - (this.passT - PASS_LAT) - extra - (defend ? DEFEND_T : 0) - (mode === "yield" ? 0 : RIVAL_DEF * this.rivalOf(c, a) + (hardA ? RISK_DEF : 0))) / PASS_W));
    const real = will > 0.1 && this.t - (c.lastTry ?? -99) > (hardC ? RISK_RETRY : 6);
    // se tocan sobre todo cuando el intento es de verdad y los dos son de no levantar
    if (real || will > 0.5) {
      const contactP = 0.004 * (0.5 + c.d.agresividad / 100) * (0.5 + a.d.agresividad / 120) * (lap1 ? 2.2 : 1) * (1 + Math.min(1, wAtt) * 1.5) * (1.4 - will) * (defend ? 1.4 : 1) * (rivals(c, a) ? 1.7 : 1) * (1 + RIVAL_CONTACT * this.rivalOf(c, a)) ;
      if (this.rng.chance(contactP)) { c.lastTry = this.t; this.duel(c, a).touch++; return this.startTouch(c, a); }
    }
    if (!this.rng.chance(Math.min(0.92, near * will))) {
      // intento fallido: el de delante tapa el hueco y los dos pierden algo; a veces el que ataca se pasa de frenada
      if (real && this.rng.chance(0.6)) {
        c.lastTry = this.t;
        this.startManeuver(c, a, false);
        a.delay += this.rng.range(0.03, 0.18);
        c.delay += this.rng.range(0.05, 0.25);
        if (this.rng.chance(0.05 * (0.5 + c.d.agresividad / 100) * PUSH_ERR[c.push] / 1.7 * (hardC ? 1.5 : 1))) {
          c.fx = { k: "lock", t: this.t };
          c.delay += this.rng.range(0.4, 1.1);
          c.tyres!.flatSpot = Math.min(1, c.tyres!.flatSpot + this.rng.range(0.2, 0.6));
          c.tyres!.F.tSurf += this.rng.range(20, 50);
          if (c.player || a.player) this.log({ kind: "incident", carId: c.id, text: `💨 ${c.d.abrev} se pasa de frenada intentando adelantar a ${a.d.abrev}` });
        }
      }
      return;
    }
    // pasa: el de delante pierde lo justo para que el otro salga por delante de la frenada
    this.grantPass(c, a, Math.max(this.rng.range(0.1, 0.3), c.followGap + this.rng.range(0.04, 0.14)));
    const outside = this.startManeuver(c, a, true);
    c.passLog = { a: a.id, until: this.t + 10, outside };
    a.passedBy = { id: c.id, t: this.t };
    c.stuck = undefined;
  }

  /**
   * Para el muro: ventaja (s/vuelta) de c sobre a en la mejor frenada del circuito si llega pegado (con rebufo y, si
   * está activo, modo adelantamiento), la que hace falta ahí y la probabilidad de pasar en ese intento. No usa azar.
   */
  passOutlook(c: Car, a: Car): { adv: number; need: number; p: number } | null {
    if (!c.tyres || !a.tyres || c.loc !== "track" || a.loc !== "track") return null;
    let m = this.track.ms[0], extra = PASS_ANY;
    for (const x of this.track.ms) if (x.overtake > m.overtake) m = x;
    if (m.overtake > 0) extra = (1 - m.overtake) * PASS_ZONE;
    else for (const x of this.track.ms) if (x.cornerSens > m.cornerSens) m = x;
    const prev = this.track.ms[(m.i - 1 + this.N) % this.N];
    const keep = (x: Car) => ({ fg: x.followGap, ah: x.aheadId, drs: x.drs, n: x.noise, dl: x.aheadDl, off: x.offLine });
    const put = (x: Car, k: { fg: number; ah: number; drs: boolean; n: number; dl?: number; off?: number }) => { x.followGap = k.fg; x.aheadId = k.ah; x.drs = k.drs; x.noise = k.n; x.aheadDl = k.dl; x.offLine = k.off; };
    const kc = keep(c), ka = keep(a);
    const moOn = this.flag === "green" && this.leaderLap + 1 >= this.drsEnabledFromLap && this.avgWater() < 0.35;
    c.noise = 0; a.noise = 0;
    c.followGap = 99; a.followGap = 99;
    const water = this.water[m.i];
    const grip = clamp((this.msTime(c, m, water + 0.6 * Math.max(0, this.waterOff[m.i] - water)).grip / this.msTime(a, m, water).grip - 1) * 100 * this.secPerGrip, -3, 5);
    // la recta: él pegado al otro; el de delante, como vaya ahora (si va en tren también lleva el modo adelantamiento)
    c.followGap = 0.3; c.aheadId = a.id; c.drs = moOn && prev.drs; c.aheadDl = 0; c.offLine = 0;
    a.followGap = ka.fg; a.drs = a.drsEligible && prev.drs;
    const straight = this.msTime(a, prev, this.water[prev.i]).t - this.msTime(c, prev, this.water[prev.i]).t;
    put(c, kc); put(a, ka);
    const adv = grip + PASS_KS * straight + (c.d.ataque - a.d.defensa) / 100 + (this.hard(c) ? RISK_ADV : 0);
    const mode = this.fightMode(a);
    const need = this.passT - PASS_LAT + extra + (mode === "defend" ? DEFEND_T : 0) + (mode === "yield" ? 0 : RIVAL_DEF * this.rivalOf(c, a) + (this.hard(a) ? RISK_DEF : 0));
    if (mode === "yield" && adv > 0) return { adv, need, p: 1 };
    return { adv, need, p: 1 / (1 + Math.exp(-(adv - need) / PASS_W)) };
  }

  /**
   * Empieza la maniobra de adelantamiento (fase 3): el que ataca se tira por el interior de la próxima curva; si el de
   * delante defiende (cierra la puerta), le tapa el interior y el ataque va por fuera. Si la curva no está clara, por
   * donde ya va cada uno. Devuelve si va por fuera.
   */
  private startManeuver(c: Car, a: Car, pass: boolean): boolean {
    const tr = this.track, L = this.L;
    const pos = ((c.s % L) + L) % L;
    let inside: number = tr.inside[Math.min(tr.inside.length - 1, Math.floor(pos / tr.ds))];
    if (!inside) { const dl = (c.lat ?? 0) - (a.lat ?? 0); inside = Math.abs(dl) > 0.3 ? Math.sign(dl) : c.id & 1 ? 1 : -1; }
    const cover = this.fightMode(a) === "defend";
    // por fuera si le cierra la puerta o si el de delante ya va por el interior (a más de un coche del lado de dentro)
    const halfW = tr.wReal * tr.wr[Math.min(tr.wr.length - 1, Math.floor(pos / tr.ds))];
    const inOccupied = ((a.lat ?? 0) - (c.lat ?? 0)) * inside > 1.0 && (a.lat ?? 0) * inside > 0.25 * halfW;
    const outside = cover || inOccupied;
    const side = outside ? -inside : inside;
    // si ya estaba en una maniobra con él por un lado, sigue por ese (no se cambia de lado a mitad)
    const prev = c.maneuver && c.maneuver.a === a.id ? c.maneuver : undefined;
    // el de delante tapa el interior: se cuenta (tus pilotos o los de cabeza), una vez por pelea
    if (cover && !prev && isRaceKind(this.kind)) {
      const pos = this.order().indexOf(a) + 1;
      if (c.player || a.player || pos <= 5) this.log({ kind: "info", text: `🚪 ${a.d.abrev} le cierra la puerta a ${c.d.abrev}`, carId: a.id, other: c.id, n: pos, code: "cierra" });
    }
    // ¿se moverá otra vez en la frenada? (solo al empezar a tapar el interior, con su propio azar)
    const weave = prev ? prev.weave : cover && isRaceKind(this.kind) && (this.moveRoll(MOVE2_P * (0.4 + a.d.agresividad / 100) * (this.hard(a) ? MOVE2_HARD : 1)) as boolean);
    c.maneuver = { a: a.id, side: prev ? prev.side : side, outside: prev ? prev.outside : outside, pass, cover, t0: prev ? prev.t0 : this.t, touch: prev?.touch, sbs: prev?.sbs, said: prev?.said, weave, weaved: prev?.weaved };
    return c.maneuver.outside;
  }

  /** Banderas azules (fase 5): el doblado se aparta de la trazada y el que le dobla pasa por ella. */
  private startBlue(c: Car, a: Car) {
    const tr = this.track, L = this.L, pos = ((c.s % L) + L) % L;
    const pi = Math.min(tr.line.length - 1, Math.floor(pos / tr.ds));
    // el que dobla, del lado de la trazada; el doblado, al otro
    const side = Math.abs(tr.line[pi]) > 0.05 ? Math.sign(tr.line[pi]) : tr.inside[pi] || (c.id & 1 ? 1 : -1);
    c.maneuver = { a: a.id, side, outside: false, pass: true, cover: false, t0: this.t, blue: true };
  }

  /** Permiso para pasar: el de delante cede (pierde algo de tiempo) y el otro pasa por velocidad. */
  private grantPass(c: Car, a: Car, lossA: number) {
    if (c.grant === a.id && this.t < c.grantUntil) return;
    c.grant = a.id;
    c.grantUntil = this.t + 8;
    // si ya venía perdiendo tiempo (le acaban de pasar otros), no se le suma más: si no, al que pasa un grupo
    // entero se le iba medio circuito
    a.delay = Math.max(a.delay, lossA);
  }

  /**
   * Habrá toque (fase 4): el que ataca se tira y el que se mete en el sitio del otro va hacia él. Cierra tarde la puerta
   * el que defiende si la estaba cerrando y es más agresivo (más aún en duro); si no, es el que ataca.
   */
  private startTouch(c: Car, a: Car) {
    this.stats.touchStart++;
    this.startManeuver(c, a, false);
    const pushC = c.d.agresividad + (this.hard(c) ? 25 : 0), pushA = a.d.agresividad + (this.hard(a) ? 25 : 0);
    c.maneuver!.touch = { byDef: c.maneuver!.cover && pushA > pushC };
    c.maneuver!.t0 = this.t;
    // el de delante frena un pelo antes de la cuenta (o el otro tarde): lo justo para que el que ataca le alcance
    const L = this.L;
    let gap = (((a.s - c.s) % L) + L) % L;
    if (gap > L / 2) gap = 0;
    a.delay = Math.max(a.delay, Math.max(0, gap - CAR_LEN * 0.5) / Math.max(20, a.v));
  }

  /** Gravedad (0 a 1) de un toque entre c y a según lo deprisa que se juntan. */
  private touchSeverity(c: Car, a: Car): number {
    return clamp(TOUCH_KL * Math.abs((c.latV ?? 0) - (a.latV ?? 0)) + TOUCH_KS * Math.abs(c.v - a.v), 0, 1);
  }

  private contact(c: Car, a: Car, sev = TOUCH_MEAN, byDef = false) {
    this.stats.contacts++;
    this.stats.touchSev += sev;
    // lo fuerte que ha sido mueve la tirada hacia las consecuencias peores o más leves (de media, igual que antes)
    const r = clamp(this.rng.next() + TOUCH_SHIFT * (sev - TOUCH_MEAN), 0, 0.999);
    // los comisarios lo miran y deciden en un par de vueltas (lo grave que fue: alerón, pinchazo, se van largos, accidente)
    this.probes.push({ at: this.t + this.rng.range(60, 200), c: c.id, a: a.id, sev: r < 0.4 ? 0.3 : r < 0.62 ? 0.6 : r < 0.93 ? 0.3 : 0.9, lap1: this.lapsDone(c) === 0, byDef });
    this.log({ kind: "control", carId: c.id, text: `🔍 Los comisarios investigan el toque entre ${c.d.abrev} y ${a.d.abrev}`, important: c.player || a.player });
    if (r < 0.4) {
      c.wing += this.rng.range(0.01, 0.035);
      c.delay += this.rng.range(0.5, 2);
      this.log({ kind: "incident", text: `💢 Toque entre ${c.d.abrev} y ${a.d.abrev}: ${c.d.abrev} daña el alerón delantero${byDef ? ` (${a.d.abrev} le cierra la puerta)` : ""}`, carId: c.id, important: c.player || a.player, pause: c.player || a.player, code: "toque", other: a.id, cierra: byDef ? a.id : undefined });
      if (c.player) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev}, alerón dañado: perdemos ~${this.wingLoss(c).toFixed(1)} s por vuelta. Cambiar el morro suma ${NOSE_TIME} s a la parada.`, important: true, code: "alerón" });
      if (this.rng.chance(0.3)) this.incident(c, `restos del alerón de ${c.d.abrev} en la pista`, 0.2, "debris");
      // a veces el golpe ha tocado algo más (suspensión, radiador): llega a boxes y se retira
      if (this.rng.chance(0.18)) this.retire(c, "daños tras el toque", 0, "garage");
    } else if (r < 0.62) {
      const victim = this.rng.chance(0.5) ? a : c;
      victim.slowPuncture = true;
      victim.pitRequest = victim.pitRequest ?? this.bestSetFor(victim, this.avgWater() > WET.iw ? "W" : this.avgWater() > WET.si ? "I" : "M")?.id ?? null;
      this.log({ kind: "incident", text: `💥 Toque ${c.d.abrev}–${a.d.abrev}: pinchazo para ${victim.d.abrev}${byDef ? ` (${a.d.abrev} cierra la puerta)` : ""}`, carId: victim.id, important: true, pause: victim.player, code: "toque", other: victim === c ? a.id : c.id, cierra: byDef ? a.id : undefined });
    } else if (r < 0.93) {
      c.delay += this.rng.range(2, 5);
      a.delay += this.rng.range(2, 5);
      c.fx = { k: "off", t: this.t, loss: c.delay }; a.fx = { k: "off", t: this.t, loss: a.delay };
      for (const x of [c, a]) if (this.rng.chance(0.35)) this.damageFloor(x, this.rng.range(0.003, 0.012), "en el toque");
      this.log({ kind: "incident", text: `💢 ${c.d.abrev} y ${a.d.abrev} se tocan y se van largos${byDef ? ` (${a.d.abrev} le cierra la puerta)` : ""}`, carId: c.id, important: c.player || a.player, code: "toque", other: a.id, cierra: byDef ? a.id : undefined });
    } else {
      const victim = this.rng.chance(0.5) ? a : c;
      victim.fx = { k: "crash", t: this.t };
      this.retire(victim, `accidente con ${victim === a ? c.d.abrev : a.d.abrev}`, 0.8);
    }
  }

  /**
   * Posición lateral (plan lateral, fase 1; ver docs/PLAN-LATERAL.md). Cada coche va por la trazada y, si se le echa
   * encima el de delante (a menos de LAT_CLOSE m), se aparta a un lado para no meterse en él: el de delante cede un poco
   * hacia el otro. Se acerca a lo que quiere poco a poco (LAT_TAU s). Sin azar y sin tocar nada más: los resultados son
   * los mismos que sin esto.
   */
  private lateral(dt: number) {
    const L = this.L, tr = this.track;
    const posOf = (c: Car) => ((c.s % L) + L) % L;
    // los coches en pista, ya ordenados por interactions() (los de detrás de la línea en la parrilla, aparte)
    const on = this.onTrack;
    for (const c of this.cars) c.latWant = 0;
    const n = on.length;
    // el que sigue de cerca se abre en las curvas rápidas para respirar aire limpio
    for (const c of this.cars) { c.inMv = false; c.passedIn = false; }
    for (const c of on) if (c.aheadId >= 0) c.latWant = this.breatheWant(c);
    // adelantamientos en marcha: cada uno a su lado, deprisa
    for (const c of on) {
      const mv = c.maneuver;
      if (!mv) continue;
      const a = this.carById(mv.a);
      let rel = posOf(c) - posOf(a);
      if (rel > L / 2) rel -= L; else if (rel < -L / 2) rel += L;
      const age = this.t - mv.t0;
      if (mv.touch) {
        // el que se mete va a por el sitio del otro hasta que se tocan (o se acaba el tiempo, o cambia la bandera)
        const byDef = mv.touch.byDef, mover = byDef ? a : c, other = byDef ? c : a;
        const touching = Math.abs(rel) < CAR_LEN && Math.abs((c.lat ?? 0) - (a.lat ?? 0)) < CAR_W;
        if (a.loc !== "track") { c.maneuver = undefined; continue; }
        if (touching || age > TOUCH_T || this.flag !== "green") {
          c.maneuver = undefined;
          if (touching) this.stats.touchGeo++;
          this.contact(c, a, touching ? this.touchSeverity(c, a) : TOUCH_MEAN, byDef);
          continue;
        }
        c.latWant = mv.side * MV_SIDE; a.latWant = -mv.side * (mv.cover ? MV_COVER : MV_YIELD);
        mover.latWant = other.latOff ?? 0;
        c.latQuick = a.latQuick = true;
        c.inMv = a.inMv = true;
        continue;
      }
      const done = a.loc !== "track" || this.flag !== "green" || age > MV_MAX_T || (mv.pass ? rel > MV_CLEAR : age > MV_FAIL_T && rel < -MV_CLEAR);
      if (done) { c.maneuver = undefined; continue; }
      // el intento que no sale: se mete, no le da y vuelve detrás
      const back = !mv.pass && age > MV_FAIL_T;
      const hc = this.hard(c), ha = this.hard(a);
      c.latWant = back ? 0 : mv.side * (mv.blue ? BLUE_ON : hc ? MV_SIDE_HARD : MV_SIDE);
      // (en duro, el que tapa el interior espera a cerrarlo hasta tener al otro encima, y lo cierra más)
      const coverNow = mv.cover && (!ha || age > COVER_LATE);
      a.latWant = back ? 0 : -mv.side * (mv.blue ? BLUE_OFF : coverNow ? (ha ? MV_COVER_HARD : MV_COVER) : mv.cover ? 0 : ha ? MV_YIELD_HARD : MV_YIELD);
      // se mueve otra vez en la frenada, hacia donde va el otro: el que ataca levanta y lo investigan
      if (mv.weave && age > MOVE2_AT && !back) {
        a.latWant = mv.side * MOVE2_TO;
        if (!mv.weaved) {
          mv.weaved = true;
          c.delay += MOVE2_LIFT;
          this.stats.move2 = (this.stats.move2 ?? 0) + 1;
          this.log({ kind: "control", carId: a.id, other: c.id, text: `🚫 ${a.d.abrev} se mueve en la frenada delante de ${c.d.abrev}: lo investigan`, important: a.player || c.player, code: "frenada" });
          this.probes.push({ at: this.t + 60 + 140 * (this.moveRoll(0, true) as number), c: c.id, a: a.id, sev: 0.3, lap1: false, byDef: true, move: true });
        }
      }
      c.latQuick = a.latQuick = true;
      c.inMv = a.inMv = true;
      if (mv.pass) a.passedIn = true;
      // en paralelo y muy juntos: se pueden rozar (sobre todo con alguno en duro)
      const gapLat = Math.abs((c.lat ?? 0) - (a.lat ?? 0));
      // (solo si alguno va en duro: en limpio siempre se deja sitio; y ya colocados, no al empezar la maniobra)
      if ((hc || ha) && !mv.blue && !back && age > SQUEEZE_AFTER && Math.abs(rel) < CAR_LEN && gapLat < SQUEEZE_GAP && this.flag === "green" && this.rng.chance(SQUEEZE_K * (1 - gapLat / SQUEEZE_GAP) * dt)) {
        c.maneuver = undefined;
        this.stats.squeeze++;
        this.contact(c, a, this.touchSeverity(c, a), ha && mv.cover && !hc);
        continue;
      }
      if (Math.abs(rel) < 5.6) {
        this.stats.sideBySide += dt;
        // rueda con rueda un buen rato: se cuenta (tus pilotos o los de cabeza)
        mv.sbs = (mv.sbs ?? 0) + dt;
        if (!mv.said && !mv.blue && mv.sbs > PARALLEL_T && isRaceKind(this.kind)) {
          mv.said = true;
          const pos = this.order().indexOf(a) + 1;
          if (c.player || a.player || pos <= 6) this.log({ kind: "info", text: `↔️ ${c.d.abrev} y ${a.d.abrev}, rueda con rueda por la P${pos}`, carId: c.id, other: a.id, n: pos, code: "paralelo" });
        }
      }
    }
    // salida: hasta la primera frenada cada uno sigue por su lado de la parrilla
    if (isRaceKind(this.kind)) for (const c of on) if (c.gridSide && this.launching(c, 330)) c.latWant = c.gridSide * GRID_SIDE;
    // boxes: el que va a parar se pone del lado de boxes antes de la entrada
    const ps = this.track.def.boxes.lado === "izquierda" ? -1 : 1;
    for (const c of on) {
      if (c.inMv) continue;
      const goingIn = isRaceKind(this.kind) ? !!c.pitRequest && !c.pitHold : c.run?.phase === "in";
      if (!goingIn) continue;
      let d = this.track.pit.entry - posOf(c);
      if (d < 0) d += L;
      if (d < PIT_APPROACH) { c.latWant = ps * PIT_SIDE * Math.min(1, (PIT_APPROACH - d) / 120); c.inMv = true; }
    }
    // coche de seguridad: en fila haciendo eses; los que se desdoblan pasan por un lado
    if (this.flag === "sc") for (const c of on) {
      if (c.inMv) continue;
      if (c.unlap) { c.latWant = (c.id & 1 ? 1 : -1) * UNLAP_SIDE; c.inMv = true; continue; }
      c.latWant = SC_WEAVE * Math.sin((2 * Math.PI * this.t) / SC_WEAVE_T + c.id * 1.7);
    }
    // salidas de pista: se va largo por fuera y vuelve
    for (const c of on) {
      if (!c.offWide) continue;
      if (this.t > c.offWide.until || c.delay <= 0.05) { c.offWide = undefined; continue; }
      c.latWant = c.offWide.side * OFF_WIDE; c.latQuick = true; c.inMv = true;
    }
    for (let i = 0; i < n; i++) {
      const me = on[i], front = on[(i - 1 + n) % n];
      if (me === front || me.inMv) continue;
      let gap = posOf(front) - posOf(me);
      if (gap < 0) gap += L;
      // se aparta antes cuanto más deprisa se le echa encima (así no lo atraviesa al pasarle)
      if (gap < LAT_CLOSE + Math.max(0, me.v - front.v) * LAT_LOOK) {
        // hacia el lado contrario al que ya se aparta el de delante; si no se aparta, por donde ya va cada uno (así no
        // cambian de lado a mitad de un adelantamiento) y, si van en la misma línea, según el coche
        const dl = (me.lat ?? 0) - (front.lat ?? 0);
        const sgn = front.latWant! > 0 ? -1 : front.latWant! < 0 ? 1 : Math.abs(dl) > 0.3 ? Math.sign(dl) : (me.id & 1 ? 1 : -1);
        if (front.latWant === 0) front.latWant = -sgn * LAT_YIELD;
        me.latWant = sgn * LAT_SIDE;
        // pegados (morro con caja de cambios o ya en paralelo): se apartan más deprisa
        if (gap < 5.6) { me.latQuick = true; front.latQuick = true; }
      }
    }
    const k = 1 - Math.exp(-dt / LAT_TAU), kq = 1 - Math.exp(-dt / LAT_TAU_QUICK);
    for (const c of this.cars) {
      const off = (c.latOff ?? 0) + (c.latWant! - (c.latOff ?? 0)) * (c.latQuick ? kq : k);
      c.latQuick = false;
      c.latOff = off;
      if (c.loc !== "track") continue;
      const pi = Math.min(tr.line.length - 1, Math.floor(posOf(c) / tr.ds));
      // la trazada de ahora (en mojado, apartada del vértice)
      const ln = tr.line[pi] * this.lineFactorMs(tr.msOfPoint[pi]);
      // apartado de la trazada, ya no la sigue del todo
      // (fuera de pista, más allá del borde)
      const lim = c.offWide ? OFF_WIDE : LAT_MAX;
      const nrm = clamp(ln * (1 - Math.min(1, Math.abs(off) / 0.3) * 0.65) + off, -lim, lim);
      // velocidad lateral (m/s): de ella sale lo fuerte que es un toque
      const latPrev = c.lat ?? 0;
      c.lat = nrm * tr.wReal * tr.wr[pi];
      c.latV = (c.lat - latPrev) / dt;
      // (el que se ha salido ya paga su salida con el tiempo perdido)
      c.offLine = c.offWide ? 0 : Math.abs(nrm - ln);
    }
    // lo que se sale cada uno de la estela del de delante (el mismo que `aheadId`)
    const count = this.flag === "green" && this.t - this.launchT > 20;
    for (let i = 0; i < n; i++) {
      const me = on[i], front = on[(i - 1 + n) % n];
      me.aheadDl = me === front ? 99 : Math.abs((me.lat ?? 0) - (front.lat ?? 0));
      // dos coches metidos uno en otro (a lo largo y a lo ancho): no debería pasar
      if (count && me !== front && me.aheadDl < 1.8) { let g = posOf(front) - posOf(me); if (g < 0) g += L; if (g < 4.5) this.stats.overlap += dt; }
    }
  }

  /**
   * Lo que se quiere abrir (fracción de la media anchura, con signo) el que sigue a otro de cerca: en una curva rápida
   * que depende de la carga, hacia el centro de la pista para salirse algo de su estela. Si no, 0.
   */
  breatheWant(c: Car, m?: Minisector): number {
    if (c.followGap >= BREATHE_GAP || this.flag !== "green") return 0;
    const tr = this.track;
    let side: number;
    if (m) {
      // (para scripts/aire.ts: en ese mismo minisector)
      if (m.aero * m.cornerSens < BREATHE_MIN) return 0;
      const ln = tr.line[Math.min(tr.line.length - 1, Math.floor((m.s0 + m.s1) / 2 / tr.ds))];
      side = Math.abs(ln) > 0.05 ? -Math.sign(ln) : 2;
    } else {
      const L = this.L, pos = ((c.s % L) + L) % L;
      side = this.breatheSide()[Math.min(tr.line.length - 1, Math.floor(pos / tr.ds))];
      if (!side) return 0;
    }
    return (side === 2 ? (c.id & 1 ? 1 : -1) : side) * LAT_BREATHE;
  }

  /**
   * Para cada punto de la pista: hacia dónde se abre el que sigue a otro al llegar ahí (la curva rápida BREATHE_AHEAD m
   * por delante): 0 no se abre, ±1 hacia ese lado (el centro, contrario a la trazada), 2 la trazada va por el centro
   * (cada uno a un lado). Se calcula una vez por circuito.
   */
  private breatheMap?: Int8Array;
  private breatheSide(): Int8Array {
    if (this.breatheMap) return this.breatheMap;
    const tr = this.track, n = tr.line.length, out = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      const j = (i + Math.round(BREATHE_AHEAD / tr.ds)) % n;
      const mm = tr.ms[tr.msOfPoint[Math.min(tr.msOfPoint.length - 1, j)]];
      if (mm.aero * mm.cornerSens < BREATHE_MIN) continue;
      out[i] = Math.abs(tr.line[j]) > 0.05 ? -Math.sign(tr.line[j]) : 2;
    }
    return (this.breatheMap = out);
  }


  /**
   * Casilla de salida a lo ancho (fase 4): la parrilla va en dos filas, la pole del lado del interior de la primera
   * curva. El coche sale ya en su lado y lo mantiene hasta la primera frenada.
   */
  private gridSlot(c: Car, i: number) {
    const pole = this.track.inside[0] || 1;
    c.gridSide = (i % 2 === 0 ? 1 : -1) * pole;
    c.latOff = c.latWant = c.gridSide * GRID_SIDE;
  }

  /**
   * Cuánto de la trazada de seco vale ahora en el punto s (1 en seco; con la pista empapada, 1 − WET_LINE_SHIFT: la
   * trazada se aparta del vértice). Lo usa también el 3D.
   */
  lineFactor(s: number): number {
    return this.lineFactorMs(this.msIndexAt(s));
  }
  private lineFactorMs(ms: number): number {
    const w = this.water[ms] ?? 0;
    if (w <= WET_LINE_W0) return 1;
    return 1 - WET_LINE_SHIFT * Math.min(1, (w - WET_LINE_W0) / (WET_LINE_W1 - WET_LINE_W0));
  }

  /** Escapatoria (m) por fuera de la curva donde está el coche. */
  private runoffAt(c: Car): number {
    const tr = this.track, L = this.L, pos = ((c.s % L) + L) % L;
    return tr.runoff[Math.min(tr.runoff.length - 1, Math.floor(pos / tr.ds))];
  }
  /** El lado de fuera de la curva donde está el coche (+1 derecha): el contrario al interior. */
  private outsideAt(c: Car): number {
    const tr = this.track, L = this.L, pos = ((c.s % L) + L) % L;
    const ins = tr.inside[Math.min(tr.inside.length - 1, Math.floor(pos / tr.ds))];
    return ins ? -ins : (c.lat ?? 0) >= 0 ? 1 : -1;
  }

  /** Coches en pista ordenados del primero al último en el trazado (lo deja interactions() en cada paso). */
  private onTrack: Car[] = [];

  /** Orden físico en pista, aire sucio y tapones. */
  private interactions() {
    const L = this.L;
    const on = this.cars.filter((c) => c.loc === "track" && c.s > -200);
    const posOf = (c: Car) => ((c.s % L) + L) % L;
    on.sort((a, b) => posOf(b) - posOf(a));
    this.onTrack = on;
    const n = on.length;
    const race = isRaceKind(this.kind);
    for (const c of on) c.chased = 99;
    for (let i = 0; i < n; i++) {
      const b = on[i];
      const a = n > 1 ? on[(i - 1 + n) % n] : null;
      if (!a || a === b) { b.followGap = 99; b.aheadId = -1; continue; }
      let gapM = posOf(a) - posOf(b);
      if (gapM < 0) gapM += L;
      b.followGap = gapM / Math.max(20, b.v);
      b.aheadId = a.id;
      a.chased = b.followGap;
      // salida: la parrilla va en dos filas y hay sitio a los lados; hasta la primera frenada cada uno avanza con su
      // arrancada y los puestos se ganan o se pierden por pura tracción (sin empujar hacia atrás al que se queda)
      if (race && this.flag === "green" && this.t < 14 && this.lapsDone(b) === 0 && b.s < 330 && a.s < 420) continue;
      if (race && this.flag === "green" && this.launchT > 0 && this.t - this.launchT < 14 && b.gridS > 0 && b.s - b.gridS < 330) continue;
      // coche de seguridad: el doblado que se desdobla pasa a todos hasta llegar a la vuelta del líder
      if (b.unlap && race && (this.flag === "sc" || this.flag === "sc_in")) {
        const lead = this.carById(this.leaderId);
        if (lead.s - b.s >= this.L - 60) { this.grantPass(b, a, 0); continue; }
        if (b.followGap < 1.2 && !a.unlap) b.unlap = undefined;
      }
      // libres/clasificación: el que no va lanzado se aparta del que sí
      if (!race && b.followGap < 1.2 && this.isFlying(b) && !this.isFlying(a)) {
        if (b.lastImpede !== a.id) {
          b.lastImpede = a.id;
          if (!this.rng.chance(0.1)) { b.delay += this.rng.range(0.02, 0.15); if (gapM < 25) this.grantPass(b, a, 0.15); continue; }
          b.delay += this.rng.range(0.3, 1.2);
          if (b.player || a.player) this.log({ kind: "incident", text: `🚧 ${a.d.abrev} estorba a ${b.d.abrev} en su vuelta rápida`, carId: b.id, important: b.player, code: "trafico", other: a.id });
        }
        if (gapM < 25) this.grantPass(b, a, 0.15);
        continue;
      }
      const minGap = 7;
      // lento de verdad (avería, daños, salida de pista): se compara cada uno con la velocidad de
      // referencia de SU punto, no en bruto (en una frenada el de delante siempre va más despacio)
      const rel = (c: Car) => c.v / Math.max(15, this.track.vref[Math.min(this.track.vref.length - 1, Math.floor(posOf(c) / this.track.ds))]);
      const slowAhead = race && this.flag === "green" && (a.delay > 0.8 || a.slowPuncture || !!a.tyres?.punctured || (this.lapsDone(b) > 0 && rel(a) < rel(b) * 0.8));
      if (gapM < minGap + 25 && slowAhead) {
        // pasar a uno que sale de boxes o que vuelve con un pinchazo no es un adelantamiento
        const limping = a.slowPuncture || !!a.tyres?.punctured || this.t - (a.pitOutT ?? -99) < 8;
        if (!limping && !(b.grant === a.id && this.t < b.grantUntil) && this.lapsDone(b) === this.lapsDone(a)) b.passLog = { a: a.id, until: this.t + 10 };
        this.grantPass(b, a, 0);
        continue;
      }
      // (un toque en marcha: le deja llegar hasta tocarle)
      if (gapM < minGap && !(b.grant === a.id && this.t < b.grantUntil) && !(b.maneuver?.touch && b.maneuver.a === a.id && gapM > 0.5)) {
        if (!race && this.isFlying(b) === this.isFlying(a) && (b.v > a.v * 1.05 || a.run?.phase === "in")) { this.grantPass(b, a, 0.1); continue; }
        const back = minGap - gapM;
        b.s -= back;
        // esa distancia se volverá a recorrer: no debe gastar combustible dos veces
        b.fuel += (this.fuelLap(b) * ENGINE_FUEL[b.engine] * PUSH_FUEL[b.push] * back) / L;
        b.followGap = minGap / Math.max(20, b.v);
      }
    }
    for (const c of this.cars) if (c.grant >= 0 && this.t > c.grantUntil) c.grant = -1;
    // anuncia los adelantamientos que ya se han completado
    for (const c of on) {
      if (!c.passLog) continue;
      const a = this.carById(c.passLog.a);
      let ahead = posOf(c) - posOf(a);
      if (ahead < 0) ahead += L;
      if (a.loc === "track" && ahead > 0 && ahead < 150) {
        this.passCount++;
        if (this.leaderLap < 1) this.passLap1++;
        this.duel(c, a).passes++;
        const pos = this.order().indexOf(c) + 1;
        const how = c.passLog.outside === undefined ? "" : c.passLog.outside ? " por fuera" : " por dentro";
        if (c.passLog.outside !== undefined) { if (c.passLog.outside) this.stats.passOut++; else this.stats.passIn++; }
        const lado = c.passLog.outside === undefined ? undefined : c.passLog.outside ? "fuera" as const : "dentro" as const;
        if (c.player || a.player || pos <= 3) this.log({ kind: "info", text: `⚔️ ${c.d.abrev} adelanta a ${a.d.abrev}${how} por la P${pos}`, carId: c.id, code: "adelanta", other: a.id, n: pos, lado });
        c.conf = clamp((c.conf ?? 0) + 0.12, -1, 1);
        a.conf = clamp((a.conf ?? 0) - 0.05, -1, 1);
        c.passLog = undefined;
      } else if (this.t > c.passLog.until) c.passLog = undefined;
    }
  }

  /**
   * Tus pilotos en plena pelea: como la IA, a menos de 0,7 s del de delante (o con uno a 0,7 s detrás) suben el
   * motor a Potencia y el ritmo a Atacar, si lo tenías en Normal y sobra combustible. Al acabar la pelea vuelve lo que
   * tenías, salvo que lo hayas cambiado tú mientras tanto. La batería ya la lleva el equipo en automático.
   */
  private playerFight(c: Car) {
    const b = c.fightBoost;
    const left = this.laps - this.lapsDone(c) - 1;
    const ahead = c.aheadId >= 0 ? this.carById(c.aheadId) : null;
    const sameLap = !!ahead && ahead.loc === "track" && this.lapsDone(ahead) === this.lapsDone(c);
    const gapA = sameLap ? c.followGap : 99, gapB = c.chased ?? 99;
    const fuelOk = c.fuel / this.fuelLap(c) > left + 0.8;
    const ok = this.autoFight && this.flag === "green" && c.loc === "track" && !c.fault && !c.pitRequest && fuelOk && !c.tyres?.punctured;
    // con histéresis: entra a 0,7 s y no sale hasta 1,1 s
    const fight = ok && (b ? gapA < 1.1 || gapB < 1.1 : gapA < 0.7 || gapB < 0.7);
    if (fight && !b) {
      if (c.engine !== 1 && c.push !== 2) return; // lo tenías en otra cosa a propósito: no se toca
      const boost = { engine: c.engine, push: c.push, setEngine: c.engine === 1 ? 2 : c.engine, setPush: c.push === 2 && gapA < 0.7 ? 3 : c.push };
      c.engine = boost.setEngine; c.push = boost.setPush;
      c.fightBoost = boost;
    } else if (!fight && b) {
      // solo se devuelve lo que no hayas tocado durante la pelea
      if (c.engine === b.setEngine) c.engine = b.engine;
      if (c.push === b.setPush) c.push = b.push;
      c.fightBoost = undefined;
    }
  }

  private isFlying(c: Car) { return c.run?.phase === "push" || c.run?.phase === "long"; }

  // ------------------------------------------------------------- boxes
  /**
   * Con la moral baja, alguno retrasa una vuelta la parada que le pide el muro, pero solo si cree que las gomas
   * aguantan (secas, con pista seca, sin pinchazo ni daños y con menos de la mitad gastada). La siguiente, entra.
   */
  private refusesStop(c: Car): boolean {
    if (!c.player || this.autoPlayers || c.pitHold || !c.tyres || c.tyres.punctured || c.wing > 0) return false;
    const fresh = DRY.includes(c.tyres.c) && this.avgWater() < 0.1 && setWear(c.tyres) < 0.5;
    if (!fresh) return false;
    const no = this.disobeys(c);
    this.orders.push({ carId: c.id, kind: "box", obeyed: !no });
    return no;
  }

  private enterPit(c: Car, entryS: number) {
    c.pitHold = undefined;
    const tr = this.track;
    const lapBase = Math.floor(entryS / this.L) * this.L;
    const entryAbs = lapBase + tr.pit.entry;
    const exitAbs = lapBase + this.L + tr.pit.exit;
    // parada segura, normal o rápida (la del jugador; la IA, normal); con el compañero parando justo antes, los
    // mecánicos van con prisa y sale mal más a menudo
    const mode = c.player && !this.autoPlayers ? c.pitMode ?? 1 : 1;
    const stacked = this.cars.some((o) => o !== c && o.team === c.team && o.loc === "pit");
    let stationary = Math.max(1.9, this.rng.gauss(c.team.boxes + PIT_MODE_T[mode], 0.12));
    if (this.rng.chance(PIT_MODE_P[mode] * (stacked ? 2.2 : 1))) stationary += this.rng.range(1.5, 7);
    const noseChange = this.changeNose(c);
    if (noseChange) stationary += NOSE_TIME;
    // la sanción de tiempo se cumple parado, antes de que toquen el coche
    const pen = c.penS ?? 0;
    if (pen > 0) {
      stationary += pen;
      c.penS = 0;
      this.log({ kind: "pit", carId: c.id, text: `⚖️ ${c.d.abrev} cumple ${pen} s de sanción en la parada`, important: c.player });
    }
    const mate = this.cars.find((o) => o !== c && o.team === c.team && o.loc === "pit");
    const setId = c.pitRequest!;
    c.pit = { noseChange, t: 0, total: tr.pit.laneLength / tr.pit.limit + stationary, entryS: entryAbs, dist: exitAbs - entryAbs, stationary, setId, changed: false, pen };
    if (mate && mate.pit) c.pit.total += Math.max(0, mate.pit.total - mate.pit.t - tr.pit.laneLength / tr.pit.limit / 2) + 0.5;
    c.loc = "pit";
    c.s = entryAbs;
    if (this.rng.chance(0.004)) this.penalize(c, 5, "exceso de velocidad en el pit-lane", "pitlane");
    const set = c.e.sets.find((s) => s.id === setId)!;
    if (typeof process !== "undefined" && process.env?.DEPURAR) console.log("   PIT", c.d.abrev, c.pitWhy ?? "?");
    c.pitWhy = undefined;
    this.log({ kind: "pit", carId: c.id, text: `🔧 ${c.d.abrev} entra a boxes → ${COMPOUNDS[set.c].name}${set.laps ? ` (usado)` : ""}`, important: c.player, code: "boxes" });
  }

  private pitStep(c: Car, dt: number) {
    const p = c.pit!;
    p.t += dt;
    const frac = Math.min(1, p.t / p.total);
    c.s = p.entryS + p.dist * frac;
    c.v = this.track.pit.limit;
    c.fuel -= ((0.2 * this.fuelLap(c)) / this.lapRefRace) * dt;
    if (!p.changed && frac > 0.5) {
      p.changed = true;
      const set = c.e.sets.find((s) => s.id === p.setId)!;
      this.mount(c, set);
      if (p.noseChange) { c.wing = 0; c.nose = undefined; }
      c.slowPuncture = false;
      c.stops++;
      c.lastPitLap = this.lapsDone(c);
      c.pitRequest = null;
      // El jugador puede parar fuera del plan (otra vuelta u otro compuesto). El plan se rehace
      // desde aquí para que lo que enseña la tarjeta y lo que aconseja el estratega cuadre con lo
      // que lleva montado. La IA ya actualiza el suyo al decidir la parada.
      if (c.player && !this.autoPlayers && DRY.includes(set.c)) {
        const lap = Math.min(this.laps - 1, Math.round(c.s / this.L));
        const cur = c.plan.stints[c.stops];
        const plannedLap = c.plan.stints[c.stops - 1]?.endLap;
        if (!cur || cur.c !== set.c || plannedLap === undefined || Math.abs(plannedLap - lap) > 1) {
          const past = Array.from({ length: c.stops }, (_, j) => ({ ...(c.plan.stints[j] ?? { c: set.c }), endLap: j === c.stops - 1 ? lap : c.plan.stints[j]?.endLap ?? lap }));
          c.plan = { stints: [...past, ...planStrategy(this, c, c.e.knowledge, lap, set.c, set.laps, null).stints] };
        }
      }
      // `n` es lo que tardan los mecánicos: sin la sanción cumplida ni el cambio de morro (antes una parada con
      // 5 s de sanción salía como «¡problema en la parada!»)
      const pen = p.pen ?? 0;
      const crew = p.stationary - pen - (p.noseChange ? NOSE_TIME : 0);
      const extra = [pen > 0 ? `${pen} s de sanción` : "", p.noseChange ? "cambio de morro" : ""].filter(Boolean).join(" y ");
      if (c.player || crew > 4) this.log({ kind: "pit", carId: c.id, text: `⏱️ Parada de ${c.d.abrev}: ${p.stationary.toFixed(1)} s${extra ? ` (${extra})` : ""}${crew > 4 ? " — ¡problema en la parada!" : ""}`, code: "parada", n: crew });
    }
    const newK = Math.floor(c.s / this.L) * this.N + this.msIndexAt(c.s);
    for (let k = c.msK + 1; k <= newK; k++) {
      c.cross[k] = this.t;
      if (k % this.N === 0) {
        const lt = c.cross[k] - c.lapStart;
        c.lapTimes.push(lt);
        c.lapStart = c.cross[k];
        const lap = k / this.N;
        if (lap > this.leaderLap) { this.leaderLap = lap; this.onLeaderLap(lap); }
        if (this.chequered) { this.finishCar(c, this.t); return; }
      }
    }
    c.msK = Math.max(c.msK, newK);
    if (frac >= 1) {
      c.loc = "track";
      c.pit = undefined;
      c.pitOutT = this.t;
      // salida insegura: lo sueltan justo cuando llega otro por la calle o por la pista
      const mode = c.player && !this.autoPlayers ? c.pitMode ?? 1 : 1;
      const near = this.cars.some((o) => o !== c && (o.loc === "track" || o.loc === "pit") && c.s - o.s > 0 && c.s - o.s < 35);
      if (near && this.rng.chance(UNSAFE_P[mode])) this.penalize(c, 5, "salida insegura del box", "insegura");
      if (c.player) this.log({ kind: "pit", carId: c.id, text: `↪️ ${c.d.abrev} sale de boxes P${this.order().indexOf(c) + 1}`, important: true, code: "sale", n: this.order().indexOf(c) + 1 });
    }
  }

  // ------------------------------------------------------- utilidades UI
  intervals(): { car: Car; gap: number; interval: number; lapsDown: number }[] {
    const ord = this.order();
    const leader = ord[0];
    if (!isRaceKind(this.kind)) {
      const ref = this.parts.length ? leader.bestByPart[this.part] : leader.best;
      return ord.map((c, i) => {
        const b = this.parts.length ? c.bestByPart[c.eliminated ? c.elimPart! : this.part] : c.best;
        const prev = ord[i - 1];
        const pb = prev ? (this.parts.length ? prev.bestByPart[this.part] : prev.best) : 0;
        return { car: c, gap: b !== undefined && isFinite(b) && ref ? b - ref : NaN, interval: b !== undefined && isFinite(b) && pb ? b - pb : NaN, lapsDown: 0 };
      });
    }
    // tras la bandera a cuadros: vueltas con las que acabará cada uno (quien sigue en pista
    // completa una más) frente a las del ganador
    const finalLaps = (c: Car) => this.lapsDone(c) + (c.loc === "fin" ? 0 : 1);
    return ord.map((c, i) => {
      const lapsDown = leader.loc === "fin" ? Math.max(0, finalLaps(leader) - finalLaps(c)) : Math.floor((leader.s - c.s) / this.L);
      const gap = i === 0 ? 0 : this.gapBetween(leader, c);
      const interval = i === 0 ? 0 : this.gapBetween(ord[i - 1], c);
      return { car: c, gap, interval, lapsDown: c.loc === "fin" && leader.loc !== "fin" ? 0 : lapsDown };
    });
  }

  axleGrips(c: Car) {
    return c.tyres ? { F: axleGrip(c.tyres.c, c.tyres.F), R: axleGrip(c.tyres.c, c.tyres.R) } : { F: 0, R: 0 };
  }

  estLap(c: Car): number {
    if (!c.tyres) return 0;
    let t = 0;
    const saved = { fg: c.followGap, ah: c.aheadId, drs: c.drs, n: c.noise };
    c.followGap = 99; c.aheadId = -1; c.drs = false; c.noise = 0;
    this.estimating = true;
    for (const m of this.track.ms) t += this.msTime(c, m, this.water[m.i]).t;
    this.estimating = false;
    c.followGap = saved.fg; c.aheadId = saved.ah; c.drs = saved.drs; c.noise = saved.n;
    return t;
  }

  letTeammatePass(front: Car) {
    const mate = this.cars.find((o) => o !== front && o.team === front.team);
    if (!mate) return;
    // con la moral baja, alguno se niega (más si va más rápido que el compañero)
    if (front.player && !this.autoPlayers && isRaceKind(this.kind)) {
      const last = (x: Car) => x.lapTimes[x.lapTimes.length - 1] ?? Infinity;
      const no = this.disobeys(front, last(front) < last(mate) - 0.1 ? 1.4 : 1);
      this.orders.push({ carId: front.id, kind: "dejarPasar", mate: mate.id, obeyed: !no });
      if (no) {
        this.log({ kind: "radio", carId: front.id, text: `📻 ${front.d.abrev}: "No, no le dejo pasar. Voy más rápido."`, important: true, code: "desobedece", n: 0, other: mate.id });
        return;
      }
    }
    front.letPass = mate.id;
  }

  /** Azar de las banderas azules: ¿pasa algo con probabilidad p? (con u, el número de 0 a 1 tal cual). */
  /** Tirada con el azar de los dobles movimientos: true con probabilidad p (o el número, con u). */
  private moveRoll(p: number, u?: boolean): number | boolean {
    const x = new Rng(this.moveS).next();
    this.moveS = ((this.moveS >>> 0 || 1) + 0x6d2b79f5) >>> 0;
    return u ? x : x < p;
  }

  private blueRoll(p: number): boolean;
  private blueRoll(p: number, u: true): number;
  private blueRoll(p: number, u?: boolean): boolean | number {
    const x = new Rng(this.blueS).next();
    this.blueS = ((this.blueS >>> 0 || 1) + 0x6d2b79f5) >>> 0;
    return u ? x : x < p;
  }

  /**
   * Sanciones que no se han podido cumplir (el sancionado ha abandonado): pasan a la parrilla de la carrera siguiente,
   * 3 puestos por 5 s y 5 por 10 s o más (como mucho 10). Solo en carrera.
   */
  gridPenaltiesNext(): { carId: number; places: number; why: string }[] {
    if (!isRaceKind(this.kind)) return [];
    return this.cars.filter((c) => c.loc === "out" && (c.penS ?? 0) > 0)
      .map((c) => ({ carId: c.id, places: Math.min(10, (c.penS ?? 0) >= 10 ? 5 : 3), why: `${c.penS} s de sanción sin cumplir` }));
  }

  /** Rivalidad de temporada entre dos coches (0 a 1). */
  rivalOf(a: Car, b: Car): number { return this.rivalK[pairKey(a.id, b.id)] ?? 0; }
  private duel(a: Car, b: Car) { return (this.duels[pairKey(a.id, b.id)] ??= { touch: 0, passes: 0 }); }

  /**
   * ¿Se niega a una orden del muro? Solo con moral (temporada) y baja (menos de 45), y según su carácter: los
   * volcánicos mucho más que los tranquilos. Con su propio azar, para no mover el de la sesión.
   */
  private disobeys(c: Car, k = 1): boolean {
    if (c.moral === undefined || c.moral >= 45) return false;
    const p = 0.6 * k * clamp((45 - c.moral) / 35, 0, 1) * DISOBEY_K[caracterOf(c.d.nombre)];
    const u = new Rng(this.moodS).next();
    this.moodS = ((this.moodS >>> 0 || 1) + 0x6d2b79f5) >>> 0;
    return u < p;
  }

  /**
   * Carrera (no la sprint) terminada en seco sin usar dos compuestos distintos: descalificados.
   * Si ha montado intermedios o de lluvia no hace falta; y no se aplica a una carrera suspendida
   * y no reanudada.
   */
  ruleBreakers(): Set<number> {
    const out = new Set<number>();
    if (this.kind !== "RACE" || this.shortened) return out;
    for (const c of this.cars) if (c.loc === "fin" && !ruleSatisfied(c)) out.add(c.id);
    return out;
  }

  /** Resultado final de la sesión. */
  results(): ResultRow[] {
    const sh = this.shortened;
    let ord = sh ? [...sh.order.map((id) => this.carById(id)), ...this.cars.filter((c) => !sh.order.includes(c.id))] : this.order();
    const dsq = this.ruleBreakers();
    // los descalificados, al final de la clasificación
    if (dsq.size) ord = [...ord.filter((c) => !dsq.has(c.id)), ...ord.filter((c) => dsq.has(c.id))];
    return ord.map((c, i) => dsq.has(c.id) ? {
      id: c.id, pos: i + 1, best: c.best, time: c.finishT, laps: this.lapsDone(c), status: "dsq" as const,
      reason: "descalificado (dos compuestos)", stops: c.stops,
      grid: this.lapOrder[0]?.includes(c.id) ? this.lapOrder[0].indexOf(c.id) + 1 : undefined,
    } : ({
      id: c.id,
      pos: i + 1,
      best: this.parts.length ? (c.bestByPart[c.eliminated ? c.elimPart! : this.part] ?? Infinity) : c.best,
      time: c.finishT,
      laps: isRaceKind(this.kind) ? (sh ? Math.min(sh.laps, this.lapsDone(c)) : this.lapsDone(c)) : c.sessionLaps,
      status: sh?.fin.includes(c.id) ? "fin" : c.loc === "out" ? (c.retireReason === "no sale" ? "dns" : "out") : isRaceKind(this.kind) ? "fin" : "ok",
      reason: c.retireReason,
      stops: c.stops,
      part: this.parts.length ? this.parts[c.eliminated ? c.elimPart! : this.part]?.name : undefined,
      grid: isRaceKind(this.kind) && this.lapOrder[0]?.includes(c.id) ? this.lapOrder[0].indexOf(c.id) + 1 : undefined,
      pen: c.penAdded || undefined,
    }));
  }
}

/**
 * Minutos y segundos con `dec` decimales. Se redondea antes de separar los minutos: si no,
 * 119,9996 s salía como «1:60.000» en vez de «2:00.000».
 */
export function fmtMinSec(t: number, dec = 3): string {
  const k = 10 ** dec;
  const u = Math.round(t * k);
  const m = Math.floor(u / (60 * k));
  const s = (u - m * 60 * k) / k;
  return `${m}:${s.toFixed(dec).padStart(dec ? dec + 3 : 2, "0")}`;
}

export function fmt(t: number) {
  return isFinite(t) && t > 0 ? fmtMinSec(t) : "—";
}
