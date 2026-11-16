// Capturas de la página de prueba del 3D (poc3d/prueba.html), con el Playwright ya instalado:
//   npx vite --port 5199  y luego  NODE_PATH=$(npm root -g) node poc3d/shot.cjs "c=spa&q=1&v=general" salida.png
// Escribe llamadas y triángulos; con DESG=1, además, qué mallas pesan más.
const { chromium } = require("playwright");
(async () => {
const [qs, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(m.type(), m.text().slice(0, 300)); });
await p.goto("http://localhost:" + (process.env.PORT || 5199) + "/poc3d/prueba.html?" + qs);
await p.waitForFunction(() => window.__done, null, { timeout: 300000 });
const d = await p.evaluate(() => window.__done);
console.log(qs, JSON.stringify(d));
if (process.env.DESG) console.log(JSON.stringify(await p.evaluate(() => window.__desglose())).replace(/\],/g, "],\n"));
if (out) await p.screenshot({ path: out, timeout: 120000 });
await b.close();
})();
