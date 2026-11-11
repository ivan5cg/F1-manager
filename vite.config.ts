import { defineConfig } from "vite";
// __BUILD__: versión de cada compilación (la usa el service worker para estrenar caché y borrar las viejas)
export default defineConfig({ base: "./", define: { __BUILD__: JSON.stringify(Date.now().toString(36)) } });
