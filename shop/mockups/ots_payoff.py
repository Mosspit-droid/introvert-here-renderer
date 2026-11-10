"""Sweatshirt library payoff scene (small out-of-focus figure walking away, Dark Chocolate original) -> Maroon + Forest Green.
Usage: python3 ots_payoff.py <raw folder> <out folder> 4500
Needs a search box, a hand-traced shoulder outline (window-lit shoulders match the bookcase) and an outer clip.
"""
import sys;import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recolour import recolour
from PIL import Image
# sweatshirt library payoff: small out-of-focus figure walking away; shoulders traced by hand (window-lit, same tone as the bookcase)
BOX=(275/1200,269/1200,505/1200,445/1200)
P=[(1250,1040),(1350,1012),(1600,1022),(1680,1078),(1722,1140),(1752,1220),(1772,1300),(1785,1400),(1080,1400),(1098,1300),(1120,1228),(1150,1160),(1190,1100)]
POLY=[(x/4500,y/4500) for x,y in P]
C=[(1250,1030),(1350,1005),(1600,1012),(1688,1072),(1735,1140),(1765,1210),(1777,1300),(1792,1400),(1838,1500),(1856,1545),(1884,1590),(1890,1690),
   (1172,1690),(1172,1592),(1106,1548),(1060,1500),(1072,1400),(1088,1300),(1108,1228),(1140,1158),(1182,1095)]
CLIP=[(x/4500,y/4500) for x,y in C]
raw,out,size=sys.argv[1],sys.argv[2],int(sys.argv[3])
for tgt,ref in [('MAROON','SW_THUMB'),('FOREST_GREEN','REF_SW_GREEN')]:
    img,m=recolour(f'{raw}/SW_LIBRARY_RUN_BROWN.jpg',f'{raw}/REF_SW_BROWN.jpg',f'{raw}/{ref}.jpg',space='lch',box=BOX,poly=POLY,clip=CLIP)
    img.save(f'{out}/OS_SW_LIBRARY_RUN_{tgt}.jpg',quality=92 if size>2000 else 90); print(tgt,flush=True)
