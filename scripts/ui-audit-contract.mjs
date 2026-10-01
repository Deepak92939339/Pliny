// Shared by the browser collector, report generator and deterministic tests.
export function getEvaluationValue(evaluation, label) {
  if (evaluation?.exceptionDetails || !evaluation?.result?.value) {
    throw new Error(`Missing or failed browser audit: ${label}`);
  }
  return evaluation.result.value;
}

export function summarizeAudits(pages, expectedPages) {
  const summary = {
    totalPages: expectedPages.length, completedAudits: 0, expectedAudits: expectedPages.length * 2,
    missingAudits: [], radiiPass: true, typeScalePass: true, blueEliminationPass: true,
    touchTargetsPass: true, desktopControlsPass: true, conversationColumnPass: true, overflowPass: true,
    flaggedRadii: [], flaggedFontSizes: [], flaggedBlue: [], flaggedTouchTargets: [],
    flaggedDesktopControls: [], flaggedConversationColumn: [],
  };
  const arrays = ["radii", "fontSizes", "blueUsages", "flaggedTouchTargets", "flaggedDesktopControls"];
  for (const page of expectedPages) {
    for (const viewport of ["mobile", "desktop"]) {
      const audit = pages[page]?.[viewport];
      if (!audit || arrays.some((key) => !Array.isArray(audit[key]))) {
        summary.missingAudits.push(`${page}/${viewport}`);
        continue;
      }
      summary.completedAudits++;
      if (audit.overflow !== false) summary.overflowPass = false;
      const add = (key, items) => summary[key].push(...items.map((item) => ({ page, viewport, ...item })));
      add("flaggedRadii", audit.radii.filter(({ val }) => ![0, 4, 6, 8, 12, 16].some((x) => Math.abs(x - val) < 0.5) && val < 500));
      add("flaggedFontSizes", audit.fontSizes.filter(({ val }) => val < 11 || (val < 40 && ![11, 12, 13, 14, 16, 20, 24, 32].some((x) => Math.abs(x - val) < 0.5))));
      add("flaggedBlue", audit.blueUsages);
      add("flaggedTouchTargets", audit.flaggedTouchTargets);
      add("flaggedDesktopControls", audit.flaggedDesktopControls);
      if (audit.conversationColumnWidth > 768) summary.flaggedConversationColumn.push({ page, viewport, width: audit.conversationColumnWidth });
    }
  }
  for (const [flag, list] of Object.entries({ radiiPass: "flaggedRadii", typeScalePass: "flaggedFontSizes", blueEliminationPass: "flaggedBlue", touchTargetsPass: "flaggedTouchTargets", desktopControlsPass: "flaggedDesktopControls", conversationColumnPass: "flaggedConversationColumn" })) {
    summary[flag] = summary.missingAudits.length === 0 && summary[list].length === 0;
  }
  summary.complete = summary.missingAudits.length === 0;
  summary.pass = summary.complete && Object.entries(summary).filter(([key]) => key.endsWith("Pass")).every(([, value]) => value);
  return summary;
}
