import {
  removeMagicCommentsFromFile,
  transformFile
} from "./chunk-P4QJEV6O.js";

// src/cli-lib.ts
import fs from "node:fs";
import path from "node:path";
import fastGlob from "fast-glob";

// package.json
var package_default = {
  name: "detype",
  version: "1.1.1",
  description: "Removes TypeScript type annotations but keeps the formatting",
  type: "module",
  exports: {
    ".": {
      import: {
        types: "./dist/index.d.ts",
        default: "./dist/index.js"
      },
      require: {
        types: "./dist/index.d.cts",
        default: "./dist/index.cjs"
      }
    }
  },
  bin: "detype.js",
  scripts: {
    prepack: "rimraf dist && pnpm build",
    build: "tsup",
    dev: "tsup --watch",
    test: "pnpm run /^test:/",
    "test:cq": "pnpm run /^cq:/",
    "test:unit": "vitest run",
    "cq:typecheck": "tsc -p tsconfig.json --noEmit",
    "cq:lint": "eslint src --max-warnings 0",
    "cq:prettier": "prettier --check test-files --ignore-unknown . '!pnpm-lock.yaml'",
    format: "prettier . --write --ignore-path .gitignore --ignore-unknown . '!pnpm-lock.yaml'"
  },
  files: [
    "dist/**/*",
    "index.d.ts"
  ],
  dependencies: {
    "@babel/core": "^7.26.0",
    "@babel/preset-typescript": "^7.26.0",
    "@babel/traverse": "^7.25.9",
    "@vue/compiler-dom": "^3.5.13",
    "fast-glob": "^3.3.2",
    prettier: "^3.4.1"
  },
  devDependencies: {
    "@cyco130/eslint-config": "^5.0.1",
    "@types/babel__core": "^7.20.5",
    "@types/babel__traverse": "^7.20.6",
    "@types/node": "22.10.1",
    eslint: "^9.16.0",
    rimraf: "^6.0.1",
    tsup: "^8.3.5",
    typescript: "^5.7.2",
    vitest: "2.1.6"
  },
  repository: {
    type: "git",
    url: "git+https://github.com/cyco130/detype.git"
  },
  keywords: [
    "typescript",
    "formatting",
    "vue",
    "sfc"
  ],
  author: "Fatih Ayg\xFCn <cyco130@gmail.com>",
  license: "MIT",
  bugs: {
    url: "https://github.com/cyco130/detype/issues"
  },
  homepage: "https://github.com/cyco130/detype#readme"
};

// src/cli-lib.ts
var { stat, mkdir } = fs.promises;
async function cli(...args2) {
  let dashDash = false;
  const params = [];
  const flags = [];
  for (const arg of args2) {
    if (arg === "--") {
      dashDash = true;
    } else if (dashDash || !arg.startsWith("-")) {
      params.push(arg);
    } else {
      flags.push(arg);
    }
  }
  if (params.length > 2) {
    console.error("Too many arguments");
    return false;
  }
  let [input, output] = params;
  if (params.length === 0 || flags.some((flag) => flag === "-h" || flag === "--help")) {
    printUsage();
    return params.length > 0;
  }
  if (flags.some((flag) => flag === "-v" || flag === "--version")) {
    console.log(VERSION);
    return true;
  }
  const removeMagic = flags.some(
    (flag) => flag === "-m" || flag === "--remove-magic-comments"
  );
  const removeTsComments = flags.some(
    (flag) => flag === "-t" || flag === "--remove-ts-comments"
  );
  if (removeMagic && removeTsComments) {
    console.warn(
      "--remove-ts-comments has no effect when --remove-magic-comments is used"
    );
  }
  if (!removeMagic) {
    [input, output] = args2;
  }
  if (!input) {
    console.error("No input file or directory given");
    printUsage();
    return false;
  }
  const inputStat = await stat(input);
  if (inputStat.isDirectory()) {
    if (!output) {
      console.error("No output directory given");
      printUsage();
      return false;
    }
    const files = (await fastGlob(unixify(input + "/**/*.{ts,tsx,vue}"))).filter((file) => !file.endsWith(".d.ts"));
    const dirs = [...new Set(files.map((file) => path.dirname(file)))].sort();
    await mkdir(path.normalize(output), { recursive: true });
    for (const dir of dirs) {
      const outDir = path.join(output, path.relative(input, dir));
      if (outDir === output) continue;
      await mkdir(path.normalize(outDir), { recursive: true });
    }
    for (const file of files) {
      const inputDir = path.dirname(path.relative(input, file));
      const outputName = inferName(file, path.join(output, inputDir));
      if (removeMagic) {
        await removeMagicCommentsFromFile(
          path.normalize(file),
          path.normalize(outputName)
        );
      } else {
        await transformFile(path.normalize(file), path.normalize(outputName), {
          removeTsComments
        });
      }
    }
    return true;
  }
  if (output) {
    const outputStat = await stat(output).catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
    if (outputStat && outputStat.isDirectory()) {
      output = inferName(input, output);
    }
  } else {
    if (removeMagic) {
      console.error(
        "Output file name is required when removing magic comments"
      );
      return false;
    }
    if (input.endsWith(".vue")) {
      console.error("Output file name is required for .vue files");
      return false;
    }
    output = inferName(input);
  }
  const outputDir = path.dirname(output);
  if (outputDir) {
    await mkdir(path.normalize(outputDir), { recursive: true });
  }
  if (removeMagic) {
    await removeMagicCommentsFromFile(
      path.normalize(input),
      path.normalize(output)
    );
  } else {
    await transformFile(path.normalize(input), path.normalize(output), {
      removeTsComments
    });
  }
  return true;
  function inferName(input2, outputDir2) {
    let output2;
    const { dir, name, ext } = path.parse(input2);
    if (removeMagic) {
      output2 = path.join(outputDir2 ?? dir, `${name}${ext}`);
    } else if (ext === ".ts") {
      output2 = path.join(outputDir2 ?? dir, name + ".js");
    } else if (ext === ".tsx") {
      output2 = path.join(outputDir2 ?? dir, name + ".jsx");
    } else if (ext === ".vue") {
      output2 = path.join(outputDir2 ?? dir, name + ".vue");
    } else {
      throw new Error(`Unknwon file extension ${input2}`);
    }
    return output2;
  }
}
function printUsage() {
  console.error(USAGE);
}
var USAGE = `Usage:

  detype [-m | --remove-magic-comments] <INPUT> [OUTPUT]

    INPUT   Input file or directory

    OUTPUT  Output file or directory
      (optional if it can be inferred and it won't overwrite the source file)

    -t, --remove-ts-comments
      Remove @ts-ignore and @ts-expect-error comments

    -m, --remove-magic-comments
      Remove magic comments only, don't perform ts > js transform

  detype [-v | --version]

    Print version and exit

  detype [-h | --help]

    Print this help and exit`;
var VERSION = package_default.version;
function unixify(name) {
  return name.replaceAll(path.sep, "/");
}

// src/cli.ts
var args = process.argv.slice(2);
cli(...args).then((success) => process.exit(success ? 0 : 1)).catch((error) => {
  console.error(error);
  process.exit(1);
});
