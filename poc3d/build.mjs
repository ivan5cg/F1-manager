// Monta la PoC en un solo HTML: npx esbuild empaqueta la simulación y se incrusta en page.html.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv[2] ?? "poc3d/mapa3d.html";
const sim = execFileSync("npx", ["esbuild", "poc3d/entry.ts", "--bundle", "--minify", "--format=iife", "--target=es2020"], { maxBuffer: 1 << 26 }).toString();
writeFileSync(out, readFileSync("poc3d/page.html", "utf8").replace("/*__SIM__*/", () => sim.replace(/<\/script/g, "<\\/script")));
console.log(out, (readFileSync(out).length / 1024).toFixed(0) + " kB");
