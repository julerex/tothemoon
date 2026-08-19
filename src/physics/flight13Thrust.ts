/** Engine thrust booking and combined thrustFn for RK4. */
import { SHIP_THRUST_N } from "./constants";
import { altitudeEarth, type ThrustFn } from "./integrator";
import { hasPropellant, limitAccelByThrust, wetMassKg } from "./propellant";
import { scale, set, type V3 } from "./vec3";
import { _steer } from "./flight13Scratch";
import type { F13Loop } from "./flight13Types";
import { peakForceN, steer, tankFor, throttleFor } from "./flight13Steer";
import { bellyAeroAccel } from "./flight13BellyAero";

function bookHotStageShip(loop: F13Loop, aTot: number, limForceN: number): number {
  if (!(loop.mode === "hot_stage" && hasPropellant(loop.prop, "ship"))) return aTot;
  const shipA = (SHIP_THRUST_N * 0.9) / Math.max(wetMassKg(loop.prop), 1) / 1000;
  const shipLim = limitAccelByThrust(loop.prop, shipA, "ship");
  loop.lastShipN += shipLim.forceN;
  loop.lastBoostN = limForceN;
  return aTot + shipLim.aKmS2;
}

/** Engine thrust accel + book last*N on loop. */
function engineThrustAccel(
  loop: F13Loop,
  t: number,
  pos: V3,
  vel: V3,
  thr: number,
): number {
  steer(t, pos, vel, loop.mode, _steer, loop.epoch, loop.interceptN); const tank = tankFor(loop.mode, loop.prop.staged);
  const aCmd = peakForceN(loop.mode, thr) / Math.max(wetMassKg(loop.prop), 1) / 1000;
  const lim = limitAccelByThrust(loop.prop, aCmd, tank);
  loop.lastBoostN = tank === "booster" ? lim.forceN : 0;
  loop.lastShipN = tank === "ship" ? lim.forceN : 0;
  const aTot = bookHotStageShip(loop, lim.aKmS2, lim.forceN);
  loop.lastThrustN = loop.lastBoostN + loop.lastShipN;
  return aTot;
}

export function clearThrustBook(loop: F13Loop): void {
  loop.lastThrustN = 0;
  loop.lastBoostN = 0;
  loop.lastShipN = 0;
}

function aeroOnlyAcc(loop: F13Loop, aero: { ax: number; ay: number; az: number }): V3 | null {
  clearThrustBook(loop);
  if (aero.ax === 0 && aero.ay === 0 && aero.az === 0) return null;
  set(loop.thrAcc, aero.ax, aero.ay, aero.az);
  return loop.thrAcc;
}

function combineThrustAero(
  loop: F13Loop, aTot: number, aero: { ax: number; ay: number; az: number },
): V3 | null {
  if (aTot < 1e-9 && aero.ax === 0 && aero.ay === 0 && aero.az === 0) return null;
  scale(loop.thrAcc, _steer, aTot);
  loop.thrAcc.x += aero.ax;
  loop.thrAcc.y += aero.ay;
  loop.thrAcc.z += aero.az;
  return loop.thrAcc;
}

/** Combined thrustFn for RK4 (aero + engines). */
export function makeFlight13ThrustFn(loop: F13Loop): ThrustFn {
  return (t, pos, vel) => {
    const alt = altitudeEarth(t, pos, loop.epoch);
    const thr = throttleFor(t, alt, loop.mode);
    const aero = bellyAeroAccel(t, pos, vel, loop.prop, loop.mode, loop.epoch, loop.interceptN);
    if (loop.mode === "idle" || thr < 1e-4) return aeroOnlyAcc(loop, aero);
    return combineThrustAero(loop, engineThrustAccel(loop, t, pos, vel, thr), aero);
  };
}

