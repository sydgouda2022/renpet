// Width/height in *CSS pixels of the available layout viewport*, never device name.
// One phone GUI; the iPad GUI chooses portrait/stacked or landscape/split.
export const LAYOUT_LIMITS=Object.freeze({tabletWidth:700,splitWidth:1024,minHeight:560});
export function layoutForViewport(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return 'phone';
 if(height<LAYOUT_LIMITS.minHeight||width<LAYOUT_LIMITS.tabletWidth)return 'phone';
 return width>=LAYOUT_LIMITS.splitWidth?'tablet-split':'tablet-stacked';
}
// A focused text editor can shrink the *layout viewport* when a virtual
// keyboard appears. A same-width height reduction isn't a UI mode change.
// Rotating or changing width still updates the responsive layout normally.
export function isKeyboardDrivenResize(previous,width,height,editing){
 return Boolean(editing&&previous&&Math.abs(width-previous.width)<40&&height<previous.height);
}
