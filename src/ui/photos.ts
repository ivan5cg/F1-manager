// Fotos de los momentos clave de la última carrera vista en 3D. Viven aquí hasta la pantalla de resultados, que las
// guarda con el resumen de la carrera si las partidas van en IndexedDB (en localStorage no caben).
export interface Photo { src: string; text: string; lap: number }
let last: Photo[] = [];
export const setLastPhotos = (p: Photo[]) => { last = p; };
/** Las fotos de la carrera que acaba de terminar (y se olvidan). */
export const takeLastPhotos = () => { const p = last; last = []; return p; };
