/** Complete headless Coptic keyboard API. No side effects on import. */
export {LANGUAGE,PREDICTION_API_VERSION,COPTIC_KEYS,keyboardKey,keyboardReady,
  isInsertableSurface,prepareKeyboardIndex,predictKeyboard,createCopticKeyboard
} from './core.mjs';
export {wordBeforeCaret,replaceRange,backspaceRange,applyKey} from './editor.mjs';
export {validateCatalog,validateManifest,verifyReleaseBytes} from './lexicon.mjs';
