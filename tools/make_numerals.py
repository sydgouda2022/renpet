"""Generate Egyptian numeral SVGs from fixed outlines of the four number signs.

The outlines were extracted once from the bundled OFL Egyptian font. Keeping
them here makes the Cloudflare test build reproducible without carrying a
large font binary or requiring fontTools at deploy time.
"""
from pathlib import Path
from math import ceil

ROOT=Path(__file__).resolve().parents[1]
SIGNS={
1000:("M53 -86Q53 -48 70.5 -15.5Q88 17 115.5 42.0Q143 67 173 82Q157 90 128.5 105.0Q100 120 79 130L103 176L200 125V732Q200 742 191.5 750.5Q183 759 142 775L132 779Q115 786 95.5 796.0Q76 806 62.5 825.5Q49 845 49 880Q49 932 88.0 967.5Q127 1003 206 1003Q262 1003 305.5 987.0Q349 971 369 955L343 939Q325 929 306.0 915.0Q287 901 287 881Q287 863 304.0 849.5Q321 836 342.0 826.5Q363 817 376 810L257 750V125L354 176L378 130Q357 120 329.0 105.0Q301 90 284 82Q314 67 341.5 42.0Q369 17 386.5 -15.5Q404 -48 404 -86ZM77 -67H380Q380 -36 346.0 7.5Q312 51 242 83L352 139L346 150L237 94V762L336 810Q323 816 307.0 825.5Q291 835 279.5 849.0Q268 863 268 881Q268 909 290.0 926.5Q312 944 333 956Q318 964 286.0 973.5Q254 983 206 983Q136 983 102.0 953.5Q68 924 68 880Q68 853 79.5 837.0Q91 821 107.5 812.5Q124 804 138 798L151 793Q183 781 197.5 771.0Q212 761 216.0 752.0Q220 743 220 732V94L111 150L105 139L215 83Q145 51 111.0 7.5Q77 -36 77 -67Z",(49,-86,404,1003)),
100:("M249 170Q247 181 238.5 218.5Q230 256 209.5 307.0Q189 358 149 407Q106 462 84.5 502.5Q63 543 56.0 574.5Q49 606 49 631Q49 707 95.0 750.5Q141 794 215 794Q276 794 315.0 760.0Q354 726 354 670Q354 636 338.0 608.0Q322 580 294.5 563.5Q267 547 233 547Q205 547 178.0 559.5Q151 572 134 603L151 613Q164 586 187.5 576.5Q211 567 233 567Q277 567 305.5 597.0Q334 627 334 670Q334 714 302.0 744.5Q270 775 215 775Q150 775 109.0 737.0Q68 699 68 631Q68 603 76.0 573.0Q84 543 105.0 506.0Q126 469 166 417Q201 373 221.0 328.0Q241 283 252.0 243.0Q263 203 268 173Z",(49,170,354,794)),
10:("M49 166V394Q49 443 85.5 478.0Q122 513 183 513Q242 513 279.0 479.0Q316 445 316 394V166H296V394Q296 435 263.0 464.0Q230 493 183 493Q134 493 101.0 464.0Q68 435 68 394V166Z",(49,166,316,513)),
1:("M49 0V416H68V0Z",(49,0,68,416)),
}

def svg(n):
    groups=[]; remaining=n; cursor=2; maxheight=0
    for value,(path,bounds) in SIGNS.items():
        count,remaining=divmod(remaining,value)
        if not count: continue
        xmin,ymin,xmax,ymax=bounds
        h=20; scale=h/(ymax-ymin); w=(xmax-xmin)*scale
        cols=min(count,3); rows=ceil(count/cols); gap=2
        width=cols*w+(cols-1)*gap; height=rows*h+(rows-1)*gap
        maxheight=max(maxheight,height); parts=[]
        for i in range(count):
            x=cursor+(i%cols)*(w+gap); y=2+(i//cols)*(h+gap)
            parts.append(f'<path transform="translate({x-xmin*scale:.3f} {y+ymax*scale:.3f}) scale({scale:.6f} {-scale:.6f})" d="{path}"/>')
        groups.append(''.join(parts)); cursor+=width+4
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {cursor:.3f} {maxheight+4:.3f}" fill="currentColor">'+''.join(groups)+'</svg>'

if __name__=='__main__':
    out=ROOT/'web/assets/numerals'; out.mkdir(parents=True,exist_ok=True)
    for old in out.glob('*.svg'): old.unlink()
    for n in [*range(1,60),*range(6155,6458)]:
        (out/f'{n}.svg').write_text(svg(n),encoding='utf-8')
    print('Created',len(list(out.glob('*.svg'))),'Egyptian numeral SVG assets.')
