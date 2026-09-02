/** Parse JSON-with-comments and trailing commas without a runtime TypeScript dependency. */
export function parseJsonc<T>(source: string): T | undefined {
  try {
    return JSON.parse(removeTrailingCommas(stripComments(source))) as T;
  } catch {
    return undefined;
  }
}

function stripComments(source: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (lineComment) {
      if (current === "\n" || current === "\r") {
        lineComment = false;
        result += current;
      } else {
        result += " ";
      }
      continue;
    }

    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        result += "  ";
        index += 1;
      } else {
        result += current === "\n" || current === "\r" ? current : " ";
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
    } else if (current === "/" && next === "/") {
      lineComment = true;
      result += "  ";
      index += 1;
    } else if (current === "/" && next === "*") {
      blockComment = true;
      result += "  ";
      index += 1;
    } else {
      result += current;
    }
  }

  return result;
}

function removeTrailingCommas(source: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index] ?? "";
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === ",") {
      let lookahead = index + 1;
      while (/\s/.test(source[lookahead] ?? "")) lookahead += 1;
      if (source[lookahead] === "}" || source[lookahead] === "]") continue;
    }
    result += current;
  }

  return result;
}
