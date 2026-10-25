/** Compatibility entry used by Renpet's version-locked keyboard adapter.
 * The actual single Coptic predictor implementation lives in core.mjs.
 */
export {LANGUAGE,PREDICTION_API_VERSION,COPTIC_KEYS,keyboardKey,keyboardReady,
  prepareKeyboardIndex,predictKeyboard,isInsertableSurface,
  createCopticKeyboard} from './core.mjs';
