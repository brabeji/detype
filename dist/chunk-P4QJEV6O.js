// src/transform.ts
import {
  transformAsync
} from "@babel/core";
import { format } from "prettier/standalone";
import babelTs from "@babel/preset-typescript";
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
  code = await format(code, {
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
    presets: [babelTs],
    generatorOpts: {
      shouldPrintComment: (comment) => comment !== "@detype: remove-me" && (!options.removeTsComments || !comment.match(/^\s*(@ts-ignore|@ts-expect-error)/))
    }
  };
  if (options.customizeBabelConfig) {
    options.customizeBabelConfig(babelConfig);
  }
  const babelOutput = await transformAsync(code, babelConfig);
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
  code = await format(code, {
    ...prettierOptions,
    filepath: fileName
  });
  return code;
}

// src/transformFile.ts
import fs from "node:fs";
import { resolveConfig } from "prettier";
var { readFile, writeFile } = fs.promises;
async function transformFile(inputFileName, outputFileName, options = {}) {
  const code = await readFile(inputFileName, "utf-8");
  const prettierOptions = await resolveConfig(inputFileName);
  const output = await transform(code, inputFileName, {
    prettierOptions,
    ...options
  });
  await writeFile(outputFileName, output, "utf-8");
}
async function removeMagicCommentsFromFile(inputFileName, outputFileName) {
  const code = await readFile(inputFileName, "utf-8");
  const prettierConfig = await resolveConfig(inputFileName);
  const output = await removeMagicComments(code, inputFileName, prettierConfig);
  await writeFile(outputFileName, output, "utf-8");
}

export {
  transform,
  removeTypes,
  removeMagicComments,
  transformFile,
  removeMagicCommentsFromFile
};
