/**
 * Starbase → Moon mission theater (existing precomputed trajectory).
 * Call once after the user picks this mission from the menu shell.
 */

import { attachMissionSeek, type MissionStartOpts } from "../app/seekUrl";
import { attachTheaterBridge } from "../debug/theaterBridge";
import { bootstrapToTheMoon } from "./moon/bootstrap";
import { startToTheMoonLoop } from "./moon/loop";

/**
 * Starbase → Moon mission theater (existing precomputed trajectory).
 * Call once after the user picks this mission from the menu shell.
 */
export function startToTheMoonMission(opts?: MissionStartOpts): void {
  const ctx = bootstrapToTheMoon();
  attachMissionSeek(ctx.clock, ctx.physicsDurationS, "to-the-moon", opts?.seekT);
  attachTheaterBridge({
    mission: "to-the-moon",
    clock: ctx.clock,
    physicsDurationS: ctx.physicsDurationS,
    director: ctx.director,
    renderer: ctx.renderer,
    camera: ctx.camera,
    craftPos: ctx.craftPos,
    craftVel: ctx.craftVel,
    disableAutoCam: () => {
      ctx.autoCam.enabled = false;
      ctx.hud.setAutoCamEnabled(false);
    },
    autoCamEnabled: () => ctx.autoCam.enabled,
    phaseId: () => ctx.cinemaState.phase,
  });
  startToTheMoonLoop(ctx);
}
