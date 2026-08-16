/**
 * Mission-theater glossary: short plain-language entries for UI terms.
 * Pure data + helpers (no DOM).
 */

export type GlossaryEntry = {
  /** Display term (title case as shown). */
  term: string;
  /** Stable id for anchors / tests. */
  id: string;
  /** Optional short category label. */
  category: "mission" | "vehicle" | "physics" | "views";
  /** One or two sentence definition. */
  definition: string;
};

/**
 * Alphabetical glossary for tothemoon.
 * Keep definitions theater-grade honest (not flight-ops claims).
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "ascent",
    term: "Ascent",
    category: "mission",
    definition:
      "Powered climb from liftoff through staging into the early orbital arc. In this theater the stack follows a staged Super Heavy + Ship profile with throttle and hot-stage cues.",
  },
  {
    id: "auto-cam",
    term: "Auto-cam",
    category: "views",
    definition:
      "Guided camera that matches the Flight 13 webcast (left pane when split) and eases to a sensible view when a lunar phase changes. Toggle with G; manual camera controls turn it off.",
  },
  {
    id: "ballistic-coast",
    term: "Ballistic coast",
    category: "physics",
    definition:
      "Unpowered free-flight under gravity only (no continuous burns). After translunar injection the Starbase → Moon pack is pure ballistic n-body until impact or flyby.",
  },
  {
    id: "boostback",
    term: "Boostback burn",
    category: "vehicle",
    definition:
      "Booster engines re-light after stage separation to reverse downrange velocity toward the landing zone (chopsticks or offshore). Shown as theater kinematics on Super Heavy recovery.",
  },
  {
    id: "chopsticks",
    term: "Chopsticks / Mechazilla",
    category: "vehicle",
    definition:
      "The tower arms at Starbase that catch Super Heavy on return. Mechazilla is the tower; the chopsticks are the pair of beams that close around the booster. Theater silhouette only — not a mechanical sim.",
  },
  {
    id: "cross-section",
    term: "Cross-section",
    category: "views",
    definition:
      "Black-and-white true-scale diagram of the launch plane: Earth surface, atmosphere shell, and booster path from liftoff through chopsticks. Open with the Cross-section button or Tab cycle.",
  },
  {
    id: "delta-v",
    term: "Δv (delta-v)",
    category: "physics",
    definition:
      "Change in velocity from thrust (km/s in this app). Propellant use follows the rocket equation; the complete card reports translunar injection Δv when available.",
  },
  {
    id: "dogleg",
    term: "Dogleg",
    category: "mission",
    definition:
      "Paid plane-change burn while in low Earth orbit to align with the lunar transfer plane. Appears as a timeline event without a separate phase id.",
  },
  {
    id: "earth-gc",
    term: "Earth GC",
    category: "views",
    definition:
      "Whole-Earth great-circle cross-section for the Flight 13 corridor (Starbase · Gauteng · Indian Ocean landing · Australia). Best-fit plane through those sites; true scale.",
  },
  {
    id: "ecliptic",
    term: "Ecliptic plane",
    category: "physics",
    definition:
      "Earth’s orbital plane around the Sun. The theater frame is ecliptic J2000 (XY = ecliptic, +Z = ecliptic north). The Polar map looks along +Z onto that plane.",
  },
  {
    id: "flame-trench",
    term: "Flame trench",
    category: "vehicle",
    definition:
      "Open channel under the launch mount that directs engine exhaust away from the pad at liftoff. The Launchpad camera (key 5) stands in this trench looking up at the Super Heavy engine bells.",
  },
  {
    id: "hardstand",
    term: "Hardstand",
    category: "vehicle",
    definition:
      "The concrete apron around the launch mount — roads, slabs, and tank farm at true pad scale. Distinct from the tan coastal brush (scrub) outside the concrete.",
  },
  {
    id: "hot-stage",
    term: "Hot-staging",
    category: "vehicle",
    definition:
      "Ship engines light while still attached, then Super Heavy separates. In the theater this is a short dual-plume window before free-flyer recovery of the booster.",
  },
  {
    id: "kepler-corridor",
    term: "Kepler corridor",
    category: "physics",
    definition:
      "Dashed amber 2-body reference ellipse from the translunar injection state, overlaid on the n-body trail (toggle O with orbits). Metrics show max |Δr| between the two paths.",
  },
  {
    id: "leo",
    term: "Low Earth orbit (LEO)",
    category: "mission",
    definition:
      "Near-circular parking orbit after ascent/circularize, before dogleg and translunar injection. Altitude is hundreds of km above Earth, not yet a lunar transfer.",
  },
  {
    id: "max-q",
    term: "Max Q",
    category: "mission",
    definition:
      "Moment of peak aerodynamic dynamic pressure on ascent. Flight-test timelines mark it; the theater models a throttle dip near this band on Super Heavy.",
  },
  {
    id: "n-body",
    term: "N-body / restricted n-body",
    category: "physics",
    definition:
      "Craft integrated under Earth + Moon gravity (plus solar tide, Earth J₂, and simple drag at low altitude). Bodies follow prescribed ephemerides; the craft does not back-react on them.",
  },
  {
    id: "olm",
    term: "OLM (Orbital Launch Mount)",
    category: "vehicle",
    definition:
      "Steel ring-table the Super Heavy stack sits on at Starbase. Open in the center so engine exhaust dumps into the flame trench; the Launchpad camera looks through that opening at the Raptors.",
  },
  {
    id: "polar-map",
    term: "Polar map",
    category: "views",
    definition:
      "Earth-centric 2-D map of ship and Moon paths looking along ecliptic +Z (perpendicular to Earth’s orbital plane). Solid ship trail, dashed Moon path, osculating lunar-orbit ring through the Moon.",
  },
  {
    id: "raptor",
    term: "Raptor",
    category: "vehicle",
    definition:
      "SpaceX methane/oxygen engine family on Super Heavy and Starship. Flight 13 demos include multi-engine landing burns and an in-space single-engine relight on Ship.",
  },
  {
    id: "scrubber",
    term: "Scrubber",
    category: "views",
    definition:
      "Mission-time slider on the transport bar. Phase marks sit above; event ticks below. Click a tick or callout to jump to that beat while playback can continue. The LIVE news ticker above the transport bar follows the same mission clock.",
  },
  {
    id: "seco",
    term: "SECO (ship engine cutoff)",
    category: "mission",
    definition:
      "Starship main engines cut off after the upper-stage burn (ascent or suborbital coast insertion on flight tests). Marks the start of coast or payload demos on Flight 13’s timeline.",
  },
  {
    id: "starbase",
    term: "Starbase",
    category: "mission",
    definition:
      "SpaceX launch site at Boca Chica, Texas. Both missions start from the pad theater (OLM, flame trench, tower, chopsticks) at true geographic scale on the spinning Earth.",
  },
  {
    id: "starship",
    term: "Starship / Super Heavy",
    category: "vehicle",
    definition:
      "Two-stage stack: Super Heavy booster + Starship upper stage (Ship). The mesh is near-true size; after stage-out the booster free-flies while Ship continues the mission.",
  },
  {
    id: "tli",
    term: "Translunar injection (TLI)",
    category: "mission",
    definition:
      "Finite burn that raises apogee toward the Moon. After TLI the baked Moon mission coasts ballistically; outcome is lunar impact or flyby in the current pack.",
  },
  {
    id: "true-scale",
    term: "True scale",
    category: "physics",
    definition:
      "Scene unit is 1 km: Earth/Moon radii and cislunar distances match real orders of magnitude. Craft length is tens of meters, so system views use a red locator when the mesh is tiny.",
  },
] as const;

const CATEGORY_ORDER: readonly GlossaryEntry["category"][] = [
  "mission",
  "vehicle",
  "physics",
  "views",
];

const CATEGORY_LABEL: Record<GlossaryEntry["category"], string> = {
  mission: "Mission phases & events",
  vehicle: "Vehicle",
  physics: "Physics & scale",
  views: "Views & controls",
};

/** Category display label. */
export function glossaryCategoryLabel(
  cat: GlossaryEntry["category"],
): string {
  return CATEGORY_LABEL[cat];
}

/** Entries sorted by category group, then alphabetically by term. */
export function glossaryGrouped(): {
  category: GlossaryEntry["category"];
  label: string;
  entries: GlossaryEntry[];
}[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    entries: GLOSSARY.filter((e) => e.category === category).sort((a, b) =>
      a.term.localeCompare(b.term),
    ),
  })).filter((g) => g.entries.length > 0);
}

/** Look up by stable id. */
export function glossaryById(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((e) => e.id === id);
}
