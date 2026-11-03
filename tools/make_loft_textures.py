"""Текстуры лофта для стенда: бетон (из фото салона), кирпич, зелень, стеклоблоки, потолок.
Запуск: python3 tools/make_loft_textures.py <фото пола салона> <папка вывода>"""
import sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
rnd = random.Random(7)
nprng = np.random.default_rng(7)

# 1. Бетон: участок пола с фото, выпрямленный по перспективе, + выравнивание яркости.
ph = Image.open(src).convert('RGB')
W, H = ph.size
quad = (int(W*0.20), int(H*0.66), 0, H, W, H, int(W*0.80), int(H*0.66))  # TL, BL, BR, TR
floor = ph.transform((1024, 1024), Image.QUAD, quad, Image.BICUBIC)
a = np.asarray(floor).astype(np.float32)
low = np.asarray(floor.filter(ImageFilter.GaussianBlur(120))).astype(np.float32)
a = a - low + low.mean(axis=(0, 1))          # убрать градиент освещения
a = np.clip((a - a.mean()) * 1.15 + a.mean(), 0, 255)
Image.fromarray(a.astype(np.uint8)).save(f'{out}/concrete.jpg', quality=88)

# 2. Кирпич: ряды 0,25×0,065 м, шов 1 см, цвета с фото, копоть и выщерблины.
S = 1024; bw, bh, m = 128, 33, 5
brick = Image.new('RGB', (S, S), (92, 84, 78)); d = ImageDraw.Draw(brick)
pal = [(112, 58, 46), (98, 50, 40), (124, 70, 54), (86, 44, 36), (118, 80, 64), (80, 52, 44), (132, 84, 66), (70, 46, 40)]
for row in range(S // (bh + m) + 1):
    y = row * (bh + m); off = (bw // 2) * (row % 2)
    for col in range(-1, S // bw + 2):
        x = col * (bw + m) - off
        c = pal[rnd.randrange(len(pal))]
        k = rnd.uniform(0.85, 1.12)
        d.rectangle([x, y, x + bw, y + bh], fill=tuple(int(v * k) for v in c))
b = np.asarray(brick).astype(np.float32)
noise = nprng.normal(0, 9, (S, S, 1))
soot = np.asarray(Image.fromarray((nprng.random((64, 64)) * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)).astype(np.float32)[..., None] / 255
b = np.clip(b + noise - soot * 34, 0, 255)
grey = b.mean(axis=2, keepdims=True); b = grey + (b - grey) * 0.8   # меньше насыщенности
Image.fromarray(b.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)).save(f'{out}/brick.jpg', quality=86)

# 3. Зелень: свисающая живая стена (альфа), гуще в центре, рваные края.
def leaves(size, n, shape, seed):
    r = random.Random(seed)
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    greens = [(46, 92, 38), (64, 120, 46), (88, 140, 58), (38, 78, 34), (110, 160, 70), (56, 108, 44)]
    w, h = size
    for _ in range(n):
        x, y = shape(r, w, h)
        if x is None: continue
        L = r.uniform(0.018, 0.035) * w; Wd = L * r.uniform(0.45, 0.7)
        ang = r.uniform(0, 360)
        leaf = Image.new('RGBA', (int(L * 2) + 4, int(L * 2) + 4), (0, 0, 0, 0)); ld = ImageDraw.Draw(leaf)
        c = greens[r.randrange(len(greens))]; k = r.uniform(0.75, 1.15)
        col = tuple(min(255, int(v * k)) for v in c) + (255,)
        cx = leaf.size[0] / 2
        ld.ellipse([cx - Wd / 2, cx - L / 2, cx + Wd / 2, cx + L / 2], fill=col)
        ld.line([cx, cx - L / 2, cx, cx + L / 2], fill=tuple(min(255, int(v * 1.25)) for v in c) + (200,), width=1)
        leaf = leaf.rotate(ang, resample=Image.BICUBIC)
        im.alpha_composite(leaf, (int(x - leaf.size[0] / 2), int(y - leaf.size[1] / 2)))
    return im
def wall_shape(r, w, h):
    x = r.uniform(0, w); top = h * (0.03 + 0.10 * abs(math.sin(x / w * 7.3)) + r.uniform(0, 0.03)); bottom = h * (0.55 + 0.4 * math.sin(x / w * math.pi) ** 1.5) + r.uniform(-40, 40)
    y = r.uniform(top, bottom)
    return (x, y) if r.random() < 0.97 else (None, None)
leaves((1024, 1024), 5200, wall_shape, 1).save(f'{out}/green-wall.webp', quality=85)
def bush_shape(r, w, h):
    a = r.uniform(0, math.tau); rad = (r.random() ** 0.6) * w * 0.45
    return w / 2 + math.cos(a) * rad, h * 0.55 + math.sin(a) * rad * 0.9
leaves((512, 512), 900, bush_shape, 2).save(f'{out}/bush.webp', quality=85)

# 4. Зелёные стеклоблоки ресепшна.
gb = Image.new('RGB', (512, 512), (40, 60, 40)); gd = ImageDraw.Draw(gb)
for i in range(8):
    for j in range(8):
        x, y = i * 64, j * 64; k = rnd.uniform(0.9, 1.1)
        gd.rectangle([x + 3, y + 3, x + 61, y + 61], fill=(int(70 * k), int(112 * k), int(56 * k)))
        gd.rectangle([x + 10, y + 10, x + 54, y + 54], fill=(int(88 * k), int(132 * k), int(68 * k)))
        gd.line([x + 12, y + 14, x + 40, y + 14], fill=(200, 230, 170), width=2)
gb.filter(ImageFilter.GaussianBlur(1.2)).save(f'{out}/glassblock.jpg', quality=88)

# 5. Потолок: сэндвич-панели.
cl = Image.new('RGB', (512, 512), (196, 199, 202)); cd = ImageDraw.Draw(cl)
for y in range(0, 512, 64): cd.line([0, y, 512, y], fill=(150, 153, 157), width=3)
c = np.clip(np.asarray(cl).astype(np.float32) + nprng.normal(0, 3, (512, 512, 1)), 0, 255)
Image.fromarray(c.astype(np.uint8)).save(f'{out}/ceiling.jpg', quality=85)
print('ok')
