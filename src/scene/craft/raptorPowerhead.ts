/**
 * Raptor 3 unshrouded powerhead (theater-grade).
 *
 * Flight 13 T+5:50 engines-cam: dark can, two offset turbopump barrels, no
 * Raptor 2 heat shield. Shared materials; cheap cylinders for a 33-engine field.
 *
 * Bell group is centered; +Z is throat / puck, −Z is nozzle (after rotX).
 *
 * @see docs/STARSHIP.md — Raptor 3
 * @see assets/flight13-webcast/tplus-000550-split-gridfin-engines.jpg
 */

import * as THREE from "three";

export const RAPTOR_POWERHEAD_PUMP_COUNT = 2;
export const RAPTOR_POWERHEAD_GIMBAL_COUNT = 3;

/** Pump azimuths (rad) — not 180° so the cluster reads asymmetric like Raptor 3. */
const PUMP_AZ = [0.35, 0.35 + 2.15] as const;
const GIMBAL_AZ0 = 0.4;

export type RaptorCyl = {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
};

export type PowerheadMats = {
  head: THREE.Material;
  pump: THREE.Material;
  pipe: THREE.Material;
};

/** Main can, straddling the throat. */
export function raptorHeadSpec(rTop: number, h: number): RaptorCyl {
  return {
    x: 0,
    y: 0,
    z: h * 0.44,
    r: rTop * 1.28,
    h: h * 0.34,
  };
}

/** LOX / CH₄ turbopump barrels beside the can. */
export function raptorPumpSpecs(rTop: number, h: number): readonly RaptorCyl[] {
  const rad = rTop * 1.22;
  return PUMP_AZ.map((az, i) => ({
    x: Math.cos(az) * rad,
    y: Math.sin(az) * rad,
    z: h * (0.46 + i * 0.03),
    r: rTop * (0.52 + i * 0.08),
    h: h * (0.2 + i * 0.04),
  }));
}

/** Electric gimbal ram stubs toward the puck (Raptor 3, no HPUs). */
export function raptorGimbalSpecs(rTop: number, h: number): readonly RaptorCyl[] {
  const rad = rTop * 0.82;
  const out: RaptorCyl[] = [];
  for (let i = 0; i < RAPTOR_POWERHEAD_GIMBAL_COUNT; i++) {
    const az = GIMBAL_AZ0 + (i / RAPTOR_POWERHEAD_GIMBAL_COUNT) * Math.PI * 2;
    out.push({
      x: Math.cos(az) * rad,
      y: Math.sin(az) * rad,
      z: h * 0.62,
      r: rTop * 0.11,
      h: h * 0.22,
    });
  }
  return out;
}

function zCyl(
  rTop: number,
  rBot: number,
  h: number,
  segs: number,
  mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function seat(mesh: THREE.Mesh, spec: RaptorCyl): void {
  mesh.position.set(spec.x, spec.y, spec.z);
}

/**
 * Dark can, throat plug, two pumps + feed pipes, three gimbal stubs.
 */
export function addPowerhead(
  g: THREE.Group,
  rTop: number,
  h: number,
  mats: PowerheadMats,
): void {
  const head = raptorHeadSpec(rTop, h);
  const can = zCyl(head.r * 0.88, head.r, head.h, 20, mats.head);
  can.name = "raptor-head";
  seat(can, head);
  g.add(can);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(head.r * 0.82, 16), mats.head);
  cap.name = "raptor-head-cap";
  cap.rotation.x = -Math.PI / 2;
  cap.position.z = head.z + head.h * 0.5;
  g.add(cap);
  const plug = new THREE.Mesh(new THREE.CircleGeometry(rTop * 0.82, 20), mats.head);
  plug.name = "raptor-throat";
  plug.rotation.x = Math.PI;
  plug.position.z = h * 0.22;
  g.add(plug);

  for (const p of raptorPumpSpecs(rTop, h)) {
    const pump = zCyl(p.r, p.r * 1.08, p.h, 12, mats.pump);
    pump.name = "raptor-pump";
    seat(pump, p);
    g.add(pump);
    const inlet = new THREE.Mesh(new THREE.SphereGeometry(p.r * 0.55, 8, 6), mats.pump);
    inlet.name = "raptor-inlet";
    inlet.position.set(p.x * 1.15, p.y * 1.15, p.z + p.h * 0.15);
    g.add(inlet);
    const pipeLen = Math.hypot(p.x, p.y) * 0.72;
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(p.r * 0.22, p.r * 0.22, pipeLen, 8),
      mats.pipe,
    );
    pipe.name = "raptor-pipe";
    pipe.position.set(p.x * 0.45, p.y * 0.45, p.z);
    pipe.rotation.z = Math.atan2(p.y, p.x) + Math.PI / 2;
    g.add(pipe);
  }

  for (const s of raptorGimbalSpecs(rTop, h)) {
    const ram = zCyl(s.r, s.r * 0.85, s.h, 8, mats.pipe);
    ram.name = "raptor-gimbal";
    seat(ram, s);
    g.add(ram);
  }
}
