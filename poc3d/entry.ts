// Entrada de la PoC del mapa 3D: la simulación real del juego, empaquetada para una página suelta.
import teamsJson from "../data/equipos-2026.json";
import spa from "../data/circuitos/spa.json";
import suzuka from "../data/circuitos/suzuka.json";
import monaco from "../data/circuitos/monaco.json";
import interlagos from "../data/circuitos/interlagos.json";
import silverstone from "../data/circuitos/silverstone.json";
import monza from "../data/circuitos/monza.json";
import bahrein from "../data/circuitos/bahrein.json";
import sepang from "../data/circuitos/sepang.json";
import singapur from "../data/circuitos/singapur.json";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import type { TeamDef } from "../src/sim/session";
import { rainAt } from "../src/sim/weather";

const CIRCUITS: Record<string, any> = { suzuka, bahrein, monaco, silverstone, spa, monza, sepang, singapur, interlagos };
const TEAMS = teamsJson.equipos as unknown as TeamDef[];

(globalThis as any).MuroSim = {
  rainAt,
  circuits: Object.values(CIRCUITS).map((c) => ({ id: c.id, nombre: c.nombre })),
  makeRace(id: string, seed: number, playerTeam: string) {
    const def = JSON.parse(JSON.stringify(CIRCUITS[id]));
    const track = buildTrack(def);
    const wk = new Weekend(newWeekend(1, def, TEAMS, seed), track, TEAMS, playerTeam);
    return wk.build("RACE");
  },
};
