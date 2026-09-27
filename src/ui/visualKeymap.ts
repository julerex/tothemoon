/**
 * Full-bleed visual KeyMap (facade).
 */

export type { KeyCap, KeyRow } from "./visualKeymapLayout";
export {
  KEYMAP_ROWS,
  rowWidthUnits,
  rowKeySlots,
  rowLiftUnits,
  keyLegendAlign,
  boardSizeUnits,
  rowsWithDigitActions,
} from "./visualKeymapLayout";
export { drawVisualKeymap } from "./visualKeymapDraw";
