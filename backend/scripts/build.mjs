// 全Lambda関数を esbuild で dist/index.mjs に単一バンドルする。
// 規約: format=esm, platform=node, target=node24, external なし（全依存バンドル）
import { build } from "esbuild";
import { readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const backendRoot = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const functionsDir = path.join(backendRoot, "functions");

const names = readdirSync(functionsDir).filter((name) => {
  const dir = path.join(functionsDir, name);
  return statSync(dir).isDirectory() && existsSync(path.join(dir, "index.ts"));
});

// CJS依存が動的requireを行ってもESMバンドルで動作するようにするためのシム
const banner = `import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);\n`;

let failed = false;
for (const name of names) {
  const entry = path.join(functionsDir, name, "index.ts");
  const outfile = path.join(functionsDir, name, "dist", "index.mjs");
  try {
    await build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      sourcemap: false,
      minify: false,
      banner: { js: banner },
      logLevel: "warning",
    });
    console.log(`built: functions/${name}/dist/index.mjs`);
  } catch (e) {
    failed = true;
    console.error(`build failed: ${name}`, e);
  }
}

if (failed) process.exit(1);
