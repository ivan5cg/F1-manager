// Carácter de cada piloto: cómo habla por radio (src/ui/voces.ts) y, con la moral baja, si obedece las órdenes del
// muro (session.ts). Por nombre: hay abreviaturas repetidas entre épocas. Los que no están, según su nombre.
export type Caracter = "calmado" | "quejica" | "volcanico" | "cerebral" | "socarron" | "novato" | "autocritico";

/** Carácter de cada piloto (por nombre: hay abreviaturas repetidas entre épocas). Los que no están, según su nombre. */
const CARACTER: Record<string, Caracter> = {
  "George Russell": "cerebral", "Kimi Antonelli": "novato", "Charles Leclerc": "volcanico", "Lewis Hamilton": "calmado",
  "Max Verstappen": "quejica", "Isack Hadjar": "novato", "Lando Norris": "autocritico", "Oscar Piastri": "calmado",
  "Liam Lawson": "volcanico", "Arvid Lindblad": "novato", "Pierre Gasly": "calmado", "Franco Colapinto": "novato",
  "Esteban Ocon": "cerebral", "Oliver Bearman": "novato", "Nico Hülkenberg": "calmado", "Gabriel Bortoleto": "novato",
  "Carlos Sainz": "cerebral", "Alexander Albon": "calmado", "Fernando Alonso": "socarron", "Lance Stroll": "quejica",
  "Sergio Pérez": "calmado", "Valtteri Bottas": "calmado", "Yuki Tsunoda": "volcanico", "Kevin Magnussen": "volcanico",
  "Zhou Guanyu": "calmado", "Logan Sargeant": "novato", "Nyck de Vries": "novato", "Mick Schumacher": "novato",
  "Kimi Räikkönen": "socarron", "Sebastian Vettel": "cerebral", "Mark Webber": "socarron", "Jenson Button": "calmado",
  "Felipe Massa": "calmado", "Michael Schumacher": "cerebral", "Nico Rosberg": "cerebral", "Robert Kubica": "calmado",
  "Romain Grosjean": "volcanico", "Pastor Maldonado": "volcanico", "Daniel Ricciardo": "socarron", "Daniil Kvyat": "volcanico",
  "Kamui Kobayashi": "volcanico", "Nikita Mazepin": "volcanico", "Nicholas Latifi": "calmado", "Antonio Giovinazzi": "calmado",
  "Marcus Ericsson": "calmado", "Rubens Barrichello": "calmado", "Jaime Alguersuari": "novato", "Pedro de la Rosa": "cerebral",
};
export const hash = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
export const caracterOf = (nombre: string): Caracter => CARACTER[nombre] ?? (["calmado", "cerebral", "novato"] as Caracter[])[hash(nombre) % 3];

