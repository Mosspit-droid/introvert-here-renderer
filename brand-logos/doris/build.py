"""Aunt Doris (Escape From Aunt Doris): cut-outs from Barry's sheet (ChatGPT, 21 Nov 2026).

sheet-approach.png: five figures on flat green, left to right: far away, closer, closer, arms filling the frame, mid-hug.
This removes the green and its fringe and saves each figure as doris-1.png ... doris-5.png (see-through background).
Usage: python3 build.py <output folder>
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import label, gaussian_filter

HERE, OUT = __file__.rsplit("/", 1)[0], sys.argv[1]
im = np.asarray(Image.open(HERE + "/sheet-approach.png").convert("RGB")).astype(np.float32)
green = (im[..., 1] - np.maximum(im[..., 0], im[..., 2])) / 255.0
alpha = np.clip(1 - (green - 0.18) / 0.32, 0, 1)
rgb = im.copy(); spill = np.maximum(im[..., 1] - np.maximum(im[..., 0], im[..., 2]), 0)
rgb[..., 1] -= np.where(alpha < 1, spill, 0)
lab, n = label(alpha > 0.5); sizes = np.bincount(lab.ravel()); sizes[0] = 0
figs = sorted([i for i in range(1, n + 1) if sizes[i] > sizes.max() * 0.03], key=lambda i: np.where(lab == i)[1].min())
for k, i in enumerate(figs, 1):
    m = gaussian_filter((lab == i).astype(np.float32), 1) > 0.05
    a = alpha * m
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), "RGBA")
    img = img.crop(img.getbbox()); img.save(f"{OUT}/doris-{k}.png", optimize=True); print(f"doris-{k}", img.size)
