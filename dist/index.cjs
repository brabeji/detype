"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  removeMagicComments: () => removeMagicComments,
  removeMagicCommentsFromFile: () => removeMagicCommentsFromFile,
  removeTypes: () => removeTypes,
  transform: () => transform,
  transformFile: () => transformFile
});
module.exports = __toCommonJS(index_exports);

// src/transform.ts
var import_core = require("@babel/core");
var import_standalone = require("prettier/standalone");
var import_preset_typescript = __toESM(require("@babel/preset-typescript"), 1);
async function transform(code, fileName, options = {}) {
  const { prettierOptions, ...removeTypeOptions } = options;
  const originalFileName = fileName;
  let propsContent = "";
  let emitsContent = "";
  code = code.replaceAll("\r\n", "\n");
  code = await removeTypes(code, fileName, removeTypeOptions);
  if (propsContent) {
    code = code.replace("defineProps(", (str) => `${str}${propsContent}`);
  }
  if (emitsContent) {
    code = code.replace("defineEmits(", (str) => `${str}${emitsContent}`);
  }
  code = await (0, import_standalone.format)(code, {
    ...prettierOptions,
    filepath: originalFileName
  });
  return code;
}
async function removeTypes(code, fileName, options) {
  code = code.replace(
    /\n\n+/g,
    (match) => `
/* @detype: empty-line=${match.length} */
`
  );
  code = processMagicComments(code);
  const removeComments = {
    enter(p) {
      if (!p.node.leadingComments) return;
      for (let i = p.node.leadingComments.length - 1; i >= 0; i--) {
        const comment = p.node.leadingComments[i];
        if (code.slice(comment.end).match(/^\s*\n\s*\n/) || comment.value.includes("@detype: empty-line")) {
          break;
        }
        comment.value = "@detype: remove-me";
      }
    }
  };
  const babelConfig = {
    filename: fileName,
    retainLines: true,
    plugins: [
      // Plugin to remove leading comments attached to TypeScript-only constructs
      {
        name: "detype-comment-remover",
        visitor: {
          TSTypeAliasDeclaration: removeComments,
          TSInterfaceDeclaration: removeComments,
          TSDeclareFunction: removeComments,
          TSDeclareMethod: removeComments,
          TSImportType: removeComments
        }
      }
    ].filter(Boolean),
    presets: [import_preset_typescript.default],
    generatorOpts: {
      shouldPrintComment: (comment) => comment !== "@detype: remove-me" && (!options.removeTsComments || !comment.match(/^\s*(@ts-ignore|@ts-expect-error)/))
    }
  };
  if (options.customizeBabelConfig) {
    options.customizeBabelConfig(babelConfig);
  }
  const babelOutput = await (0, import_core.transformAsync)(code, babelConfig);
  if (!babelOutput || babelOutput.code === void 0 || babelOutput.code === null) {
    throw new Error("Babel error");
  }
  return babelOutput.code.replaceAll(/\n\n*/g, "\n").replace(
    /\/\* @detype: empty-line=([0-9]+) \*\//g,
    (_match, p1) => `
`.repeat(p1 - 2)
  );
}
function processMagicComments(input) {
  const REPLACE_COMMENT = "// @detype: replace\n";
  const WITH_COMMENT = "// @detype: with\n";
  const END_COMMENT = "// @detype: end\n";
  let start = input.indexOf(REPLACE_COMMENT);
  while (start >= 0) {
    const middle = input.indexOf(WITH_COMMENT, start);
    if (middle < 0) return input;
    const middleEnd = middle + WITH_COMMENT.length;
    const end = input.indexOf(END_COMMENT, middleEnd);
    if (end < 0) return input;
    const endEnd = end + END_COMMENT.length;
    const before = input.slice(0, start);
    const newText = input.slice(middleEnd, end).replaceAll(/^\s*\/\//gm, "");
    const after = input.slice(endEnd);
    input = before + newText + after;
    start = input.indexOf(REPLACE_COMMENT, before.length + newText.length);
  }
  return input;
}
async function removeMagicComments(code, fileName, prettierOptions) {
  const REPLACE_COMMENT = "// @detype: replace\n";
  const WITH_COMMENT = "// @detype: with\n";
  const END_COMMENT = "// @detype: end\n";
  let start = code.indexOf(REPLACE_COMMENT);
  let startEnd = start + REPLACE_COMMENT.length;
  while (start >= 0) {
    const middle = code.indexOf(WITH_COMMENT, start);
    if (middle < 0) return code;
    const middleEnd = middle + WITH_COMMENT.length;
    const end = code.indexOf(END_COMMENT, middleEnd);
    if (end < 0) return code;
    const endEnd = end + END_COMMENT.length;
    const before = code.slice(0, start);
    const keptText = code.slice(startEnd, middle);
    const after = code.slice(endEnd);
    code = before + keptText + after;
    start = code.indexOf(REPLACE_COMMENT, before.length + keptText.length);
    startEnd = start + REPLACE_COMMENT.length;
  }
  code = await (0, import_standalone.format)(code, {
    ...prettierOptions,
    filepath: fileName
  });
  return code;
}

// src/transformFile.ts
var import_node_fs = __toESM(require("fs"), 1);
var import_prettier = require("prettier");
var { readFile, writeFile } = import_node_fs.default.promises;
async function transformFile(inputFileName, outputFileName, options = {}) {
  const code = await readFile(inputFileName, "utf-8");
  const prettierOptions = await (0, import_prettier.resolveConfig)(inputFileName);
  const output = await transform(code, inputFileName, {
    prettierOptions,
    ...options
  });
  await writeFile(outputFileName, output, "utf-8");
}
async function removeMagicCommentsFromFile(inputFileName, outputFileName) {
  const code = await readFile(inputFileName, "utf-8");
  const prettierConfig = await (0, import_prettier.resolveConfig)(inputFileName);
  const output = await removeMagicComments(code, inputFileName, prettierConfig);
  await writeFile(outputFileName, output, "utf-8");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  removeMagicComments,
  removeMagicCommentsFromFile,
  removeTypes,
  transform,
  transformFile
});
