const DIFF_MARKERS = {
  insert: "+",
  delete: "-",
  change: "~",
  equal: " ",
};

export const getHistoryDiffMarker = (type) => DIFF_MARKERS[type] || " ";

export function buildHistoryDiffSummary(segments = []) {
  const rows = [];
  let oldLine = 1;
  let newLine = 1;
  let added = 0;
  let removed = 0;
  let current = {
    parts: [],
    hasOld: false,
    hasNew: false,
  };

  const pushLine = () => {
    if (current.parts.length === 0) {
      return;
    }

    const hasInsert = current.parts.some((part) => part.type === "insert");
    const hasDelete = current.parts.some((part) => part.type === "delete");
    let lineType = "equal";

    if (hasInsert && hasDelete) {
      lineType = "change";
    } else if (hasInsert) {
      lineType = "insert";
    } else if (hasDelete) {
      lineType = "delete";
    }

    rows.push({
      key: `${rows.length}-${oldLine}-${newLine}`,
      type: lineType,
      oldLine: current.hasOld ? oldLine : null,
      newLine: current.hasNew ? newLine : null,
      parts: current.parts,
    });

    if (current.hasOld) {
      oldLine += 1;
    }
    if (current.hasNew) {
      newLine += 1;
    }
    if (lineType === "insert") {
      added += 1;
    } else if (lineType === "delete") {
      removed += 1;
    } else if (lineType === "change") {
      added += 1;
      removed += 1;
    }

    current = { parts: [], hasOld: false, hasNew: false };
  };

  segments.forEach((segment) => {
    const text = segment?.text ?? "";
    if (text.length === 0) {
      return;
    }

    const lines = text.split("\n");
    lines.forEach((line, lineIndex) => {
      const isLast = lineIndex === lines.length - 1;
      const isNewline = !isLast;
      const shouldAddBlank = line === "" && isNewline;

      if (line !== "" || shouldAddBlank) {
        current.parts.push({
          type: segment.type,
          text: line,
        });

        if (segment.type === "equal" || segment.type === "delete") {
          current.hasOld = true;
        }
        if (segment.type === "equal" || segment.type === "insert") {
          current.hasNew = true;
        }
      }

      if (isNewline) {
        pushLine();
      }
    });
  });

  if (current.parts.length > 0) {
    pushLine();
  }

  return { rows, added, removed };
}
