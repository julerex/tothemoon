import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRoute } from "./shell";
import {
  missionById,
  missionByPath,
  MISSIONS,
} from "./missionCatalog";
import {
  GLOSSARY,
  glossaryById,
  glossaryCategoryLabel,
  glossaryGrouped,
} from "./glossary";
import {
  MAIN_MENU_ITEMS,
  mainMenuActionForDigit,
} from "./menus";

describe("parseRoute", () => {
  it("maps empty and root to main", () => {
    assert.equal(parseRoute("").kind, "main");
    assert.equal(parseRoute("#").kind, "main");
    assert.equal(parseRoute("#/").kind, "main");
  });

  it("maps missions path", () => {
    assert.equal(parseRoute("#/missions").kind, "missions");
    assert.equal(parseRoute("#missions").kind, "missions");
  });

  it("maps glossary path", () => {
    assert.equal(parseRoute("#/glossary").kind, "glossary");
    assert.equal(parseRoute("#glossary").kind, "glossary");
  });

  it("maps mission paths", () => {
    const r = parseRoute("#/mission/to-the-moon");
    assert.equal(r.kind, "mission");
    assert.equal(r.missionPath, "to-the-moon");
    const r2 = parseRoute("#/mission/flight-13");
    assert.equal(r2.missionPath, "flight-13");
  });

  it("unknown falls back to main", () => {
    assert.equal(parseRoute("#/nope").kind, "main");
  });
});

describe("missionCatalog", () => {
  it("lists lunar and flight-13", () => {
    assert.ok(MISSIONS.some((m) => m.id === "to-the-moon"));
    assert.ok(MISSIONS.some((m) => m.id === "flight-13"));
  });

  it("resolves by path", () => {
    assert.equal(missionByPath("to-the-moon")?.id, "to-the-moon");
    assert.equal(missionByPath("flight-13")?.status, "ready");
  });

  it("resolves by id and rejects unknown", () => {
    assert.equal(missionById("to-the-moon")?.path, "to-the-moon");
    assert.equal(missionById("flight-13")?.id, "flight-13");
    assert.equal(missionById("nope"), undefined);
    assert.equal(missionByPath("nope"), undefined);
  });
});

describe("glossary", () => {
  it("has unique ids and non-empty definitions", () => {
    const ids = new Set<string>();
    for (const e of GLOSSARY) {
      assert.ok(e.term.length > 0);
      assert.ok(e.definition.length > 10);
      assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
      ids.add(e.id);
    }
    assert.ok(GLOSSARY.length >= 12);
  });

  it("groups by category without dropping entries", () => {
    const grouped = glossaryGrouped();
    const n = grouped.reduce((s, g) => s + g.entries.length, 0);
    assert.equal(n, GLOSSARY.length);
    assert.ok(grouped.every((g) => g.entries.length > 0));
  });

  it("resolves known terms", () => {
    assert.equal(glossaryById("tli")?.term.includes("Translunar"), true);
    assert.equal(glossaryById("ecliptic")?.category, "physics");
    assert.equal(glossaryById("missing"), undefined);
  });

  it("labels every category", () => {
    assert.ok(glossaryCategoryLabel("mission").length > 0);
    assert.ok(glossaryCategoryLabel("vehicle").length > 0);
    assert.ok(glossaryCategoryLabel("physics").length > 0);
    assert.ok(glossaryCategoryLabel("views").length > 0);
  });
});

describe("main menu digit keys", () => {
  it("numbers items 1…n without gaps", () => {
    assert.equal(MAIN_MENU_ITEMS.length, 3);
    MAIN_MENU_ITEMS.forEach((item, i) => {
      assert.equal(item.digit, String(i + 1));
    });
  });

  it("maps digit keys to navigation and external actions", () => {
    assert.deepEqual(mainMenuActionForDigit("1"), {
      type: "nav",
      path: "/missions",
    });
    assert.deepEqual(mainMenuActionForDigit("2"), {
      type: "nav",
      path: "/glossary",
    });
    assert.deepEqual(mainMenuActionForDigit("3"), {
      type: "external",
      href: "https://github.com/julerex/tothemoon",
    });
    assert.equal(mainMenuActionForDigit("0"), null);
    assert.equal(mainMenuActionForDigit("4"), null);
    assert.equal(mainMenuActionForDigit("a"), null);
  });
});
