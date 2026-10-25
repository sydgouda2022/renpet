/** Versioned, Coptic-only public prediction API.
 * Renpet's historical import path/argument shapes remain backward compatible.
 */
export const PREDICTION_API_VERSION = 1;
export {LANGUAGE,keyboardKey,prepareKeyboardIndex,predictKeyboard,
  isInsertableSurface} from './_generic_search.mjs';
import {isInsertableSurface} from './_generic_search.mjs';
/** Compatibility helper retained for the standalone PWA and older consumers. */
export function keyboardReady(surface) {return isInsertableSurface(surface);}
