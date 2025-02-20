// src/transform.ts
import {
  transformAsync
} from "@babel/core";
import { format } from "prettier";
import {
  parse as parseVueSfc
} from "@vuedx/compiler-sfc";
import { compileScript } from "@vue/compiler-sfc";
import {
  traverse as traverseVueAst,
  isSimpleExpressionNode as isVueSimpleExpressionNode,
  isComponentNode as isVueComponentNode
} from "@vuedx/template-ast-types";
import babelTs from "@babel/preset-typescript";
function getDefinePropsObject(content) {
  const matched = /\sprops:\s*\{/m.exec(content);
  if (matched) {
    const startContentIndex = matched.index + matched[0].length - 1;
    let leftBracketCount = 1;
    let endContentIndex = startContentIndex + 1;
    while (leftBracketCount) {
      if (content.charAt(endContentIndex) === "{") {
        leftBracketCount++;
      } else if (content.charAt(endContentIndex) === "}") {
        leftBracketCount--;
      }
      endContentIndex++;
    }
    return content.substring(startContentIndex, endContentIndex);
  }
  return "";
}
async function transform(code, fileName, options = {}) {
  const { prettierOptions, ...removeTypeOptions } = options;
  const originalCode = code;
  const originalFileName = fileName;
  let propsContent = "";
  let emitsContent = "";
  code = code.replaceAll("\r\n", "\n");
  if (fileName.endsWith(".vue")) {
    const parsedVue = parseVueSfc(code);
    if (parsedVue.descriptor.script?.lang !== "ts" && parsedVue.descriptor.scriptSetup?.lang !== "ts") {
      return originalCode;
    }
    let { script: script1, scriptSetup: script2 } = parsedVue.descriptor;
    const isContainsDefinePropsType = script2?.content.match(/defineProps\s*</m);
    const isContainsDefineEmitType = script2?.content.match(/defineEmits\s*</m);
    if (isContainsDefinePropsType || isContainsDefineEmitType) {
      const { content } = compileScript(parsedVue.descriptor, {
        id: "xxxxxxx"
      });
      if (isContainsDefinePropsType) {
        propsContent = getDefinePropsObject(content);
      }
      if (isContainsDefineEmitType) {
        emitsContent = content.match(/\semits:\s(\[.*\]?)/m)?.[1] || "";
      }
    }
    if (script1 && script2 && script1.loc.start.offset < script2.loc.start.offset) {
      [script2, script1] = [script1, script2];
    }
    code = await removeTypesFromVueSfcScript(
      code,
      fileName,
      script1,
      parsedVue.descriptor.template?.ast,
      removeTypeOptions
    );
    code = await removeTypesFromVueSfcScript(
      code,
      fileName,
      script2,
      parsedVue.descriptor.template?.ast,
      removeTypeOptions
    );
  } else {
    code = await removeTypes(code, fileName, removeTypeOptions);
  }
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
async function removeTypesFromVueSfcScript(code, fileName, script, templateAst, options) {
  if (script === null || script.lang !== "ts") return code;
  if (script.setup && templateAst) {
    const expressions = /* @__PURE__ */ new Set();
    traverseVueAst(templateAst, {
      enter(node) {
        if (isVueSimpleExpressionNode(node) && !node.isStatic) {
          expressions.add(`[${node.content}]`);
        } else if (isVueComponentNode(node)) {
          expressions.add(`[${node.tag}]`);
        }
      }
    });
    script.content += "/* @detype: remove-after-this */" + [...expressions].join(";");
  }
  let scriptCode = await removeTypes(script.content, fileName + ".ts", options);
  const removeAfterIndex = scriptCode.indexOf(
    "/* @detype: remove-after-this */"
  );
  if (removeAfterIndex >= 0) {
    scriptCode = scriptCode.slice(0, removeAfterIndex);
  }
  let before = code.slice(0, script.loc.start.offset);
  const after = code.slice(script.loc.end.offset);
  const matches = before.match(/\blang\s*=\s*["']ts["']/);
  if (matches) {
    const lastMatch = matches[matches.length - 1];
    const lastMatchIndex = before.lastIndexOf(lastMatch);
    before = before.slice(0, lastMatchIndex) + before.slice(lastMatchIndex + lastMatch.length);
  }
  return before + scriptCode + after;
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
