import { build } from "esbuild";
import Module from "node:module";
import path from "node:path";

export async function sourceModule(file) {
  const filename = path.resolve(file);
  const result = await build({ entryPoints: [filename], bundle: true, packages: "external", platform: "node", format: "cjs", write: false });
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  module._compile(result.outputFiles[0].text, filename);
  return module.exports;
}
