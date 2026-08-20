/**
 * Starbase → Moon mission theater (existing precomputed trajectory).
 * Call once after the user picks this mission from the menu shell.
 */

import { attachMissionSeek, type MissionStartOpts } from "../app/seekUrl";
import { attachTheaterBridge } from "../debug/theaterBridge";
import { bootstrapToTheMoon } from "./moon/bootstrap";
import { startToTheMoonLoop } from "./moon/loop";

/**
 * Build the lunar theater and start the render loop under the loading overlay.
 * Returns an unveil callback for the debug bridge after the overlay hides.
 */
export function startToTheMoonMission(opts?: MissionStartOpts): () => void {
  const ctx = bootstrapToTheMoon();
  attachMissionSeek(ctx.clock, ctx.physicsDurationS, "to-the-moon", opts?.seekT);
  const resume = ctx.clock.playing;
  ctx.clock.pause();
  startToTheMoonLoop(ctx);
  return () => {
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
    if (resume) ctx.clock.play();
  };
}
