/**
 * Starship Flight 14 full mission theater (baked orbital profile).
 * Call once after the user picks this mission from the menu shell.
 */

import { attachMissionSeek, type MissionStartOpts } from "../app/seekUrl";
import { attachTheaterBridge } from "../debug/theaterBridge";
import { bootstrapFlight14 } from "./flight14/bootstrap";
import { startFlight14Loop } from "./flight14/loop";

/**
 * Build the Flight 14 theater and start the render loop under the loading
 * overlay. Returns an unveil callback: attach the debug bridge and resume
 * playback after the overlay is gone so agents do not screenshot the loader.
 */
export function startFlight14Theater(opts?: MissionStartOpts): () => void {
  const ctx = bootstrapFlight14();
  attachMissionSeek(ctx.clock, ctx.physicsDurationS, "flight-14", opts?.seekT);
  const resume = ctx.clock.playing;
  ctx.clock.pause();
  startFlight14Loop(ctx);
  return () => {
    attachTheaterBridge({
      mission: "flight-14",
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
