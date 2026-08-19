/** Shared scratch vectors for Flight 13 integrator (single-threaded). */
import { v3 } from "./vec3";

export const _up = v3();
export const _relP = v3();
export const _relV = v3();
export const _steer = v3();
export const _tmp = v3();
export const _tmp2 = v3();
export const _tmp3 = v3();
export const _splashLocal = v3();
export const _along = v3();
export const _horiz = v3();
