/**
 * Starship Flight 13 full mission theater (baked suborbital profile).
 * Call once after the user picks this mission from the menu shell.
 */

import { attachMissionSeek, type MissionStartOpts } from "../app/seekUrl";
import { attachTheaterBridge } from "../debug/theaterBridge";
import { bootstrapFlight13 } from "./flight13/bootstrap";
import { startFlight13Loop } from "./flight13/loop";

/**
 * Build the Flight 13 theater and start the render loop under the loading
 * overlay. Returns an unveil callback: attach the debug bridge and resume
 * playback after the overlay is gone so agents do not screenshot the loader.
 */
export function startFlight13Theater(opts?: MissionStartOpts): () => void {
  const ctx = bootstrapFlight13();
  attachMissionSeek(ctx.clock, ctx.physicsDurationS, "flight-13", opts?.seekT);
  const resume = ctx.clock.playing;
  ctx.clock.pause();
  startFlight13Loop(ctx);
  return () => {
    attachTheaterBridge({
      mission: "flight-13",
      clock: ctx.clock,
      physicsDurationS: ctx.physicsDurationS,
      director: ctx.director,
      renderer: ctx.renderer,
      camera: ctx.camera,
      craftPos: ctx.craftPos,
      craftVel: ctx.craftVel,
      disableAutoCam: ctx.disableAutoCam,
      autoCamEnabled: () => ctx.autoCam.enabled,
      phaseId: () => ctx.cinemaState.phase,
    });
    if (resume) ctx.clock.play();
  };
}
