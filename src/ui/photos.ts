// Fotos de los momentos clave de la última carrera vista en 3D. Solo viven en memoria hasta la pantalla de resultados:
// no se guardan con la partida (ocuparían demasiado).
export interface Photo { src: string; text: string; lap: number }
let last: Photo[] = [];
export const setLastPhotos = (p: Photo[]) => { last = p; };
/** Las fotos de la carrera que acaba de terminar (y se olvidan). */
export const takeLastPhotos = () => { const p = last; last = []; return p; };
