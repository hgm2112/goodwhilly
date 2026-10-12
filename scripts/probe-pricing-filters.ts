import { keepMatching, type BrowseEntry, nameHasVariant } from "@/lib/ebay/pricing";

function mk(title: string): BrowseEntry {
  return { title, cents: 1234, image: null };
}

let failed = 0;

function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error("FAIL:", label);
    failed++;
  } else {
    console.log("PASS:", label);
  }
}

function run() {
  // Working example: Play Booster Pack
  const playName = "Duskmourn House of Horror: Play Booster Pack";
  expect(nameHasVariant(playName), "play name has variant");

  const goodPlay = mk("Duskmourn Play Booster Pack Sealed MTG");
  const badPlayBox = mk("Duskmourn Play Booster Box");
  const badPlayMulti = mk("Duskmourn Play Booster Pack Display");

  const playPool = keepMatching([goodPlay, badPlayBox, badPlayMulti], playName);
  expect(playPool.some((e) => e.title.includes("Play Booster Pack")), "play keeps good pack title");
  expect(!playPool.some((e) => e.title.includes("Booster Box")), "play drops box title");
  expect(!playPool.some((e) => /Display/.test(e.title)), "play drops multi-pack display");

  // Hanger Booster (no "pack" word in sub, per clarification)
  const hangerName = "Some Set: Hanger Booster";
  expect(nameHasVariant(hangerName), "hanger name has variant");

  const goodHanger = mk("Some Set Hanger Booster Pack Sealed");
  const badHangerBox = mk("Some Set Hanger Booster Box");
  const badHangerMulti = mk("Hanger Booster Display Case of 4");

  const hangerPool = keepMatching([goodHanger, badHangerBox, badHangerMulti], hangerName);
  expect(hangerPool.some((e) => e.title.includes("Hanger Booster Pack")), "hanger keeps good pack title");
  expect(!hangerPool.some((e) => e.title.includes("Booster Box")), "hanger drops box");
  expect(!hangerPool.some((e) => /Display Case/.test(e.title)), "hanger drops case/multi");

  // Set Booster Pack
  const setName = "Duskmourn: Set Booster Pack";
  const goodSet = mk("Duskmourn Set Booster Pack");
  const badSet = mk("Duskmourn Set Booster Box 6 Pack");
  const setPool = keepMatching([goodSet, badSet], setName);
  expect(setPool.length === 1 && setPool[0].title.includes("Set Booster Pack"), "set booster keeps pack");

  // Box variant should NOT get pack exclusions
  const boxName = "Duskmourn: Play Booster Box";
  const boxTitle = mk("Duskmourn Play Booster Box Sealed");
  const packTitle = mk("Duskmourn Play Booster Pack");
  const boxPool = keepMatching([boxTitle, packTitle], boxName);
  expect(boxPool.some((e) => e.title.includes("Booster Box")), "box variant keeps box title");

  // Plural tolerance: "pack" name should match "packs" title
  const pluralTitle = mk("Duskmourn Play Booster Packs (Individual)");
  const pluralPool = keepMatching([pluralTitle], playName);
  expect(pluralPool.length > 0, "plural tolerance works for packs");

  // Hanger treated singular (no "hangers" needed, but test no false plural logic)
  const hangerSingular = mk("Hanger Booster");
  expect(keepMatching([hangerSingular], hangerName).length > 0, "hanger singular matches");

  if (failed > 0) {
    console.error(`\n${failed} failures`);
    process.exit(1);
  }
  console.log("\nAll pricing filter regression tests passed.");
}

run();
