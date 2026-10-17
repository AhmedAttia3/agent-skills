#!/usr/bin/env python3
"""توليد أيقونات PWA (PNG) بدون أي مكتبات خارجية — rasterization بسيط للمثلثات والدوائر.

الاستخدام: python3 scripts/gen-icons.py
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'public', 'icons')
SS = 3  # supersampling للتجانس (anti-aliasing)

BG = ({{BRAND_HEX_TUPLE}})      # برتقالي التطبيق
PLATE = (0xFF, 0xFF, 0xFF)
FORK = (0xFF, 0xD8, 0xA8)


def write_png(path, width, height, pixels):
    raw = b''.join(b'\x00' + bytes(channel for pixel in row for channel in pixel) for row in pixels)
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    png = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) +
           chunk(b'IDAT', zlib.compress(raw, 9)) +
           chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(png)


def in_rounded_square(x, y, size, radius):
    r = radius
    if x < r and y < r:
        return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x > size - r and y < r:
        return (x - (size - r)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y > size - r:
        return (x - r) ** 2 + (y - (size - r)) ** 2 <= r * r
    if x > size - r and y > size - r:
        return (x - (size - r)) ** 2 + (y - (size - r)) ** 2 <= r * r
    return True


def render(size, maskable=False):
    """يرسم أيقونة: مربع دائري برتقالي + طبق أبيض + شوكة."""
    pad = size * (0.10 if maskable else 0)
    inner = size - 2 * pad
    cx = cy = size / 2
    plate_r = inner * 0.30
    plate_inner = inner * 0.21

    # الشوكة: مقبض + رأس بأربع أسنان على يمين الطبق
    fork_x = cx + inner * 0.30
    handle_w = inner * 0.045
    tine_gap = inner * 0.028

    px = [[(255, 255, 255)] * size for _ in range(size)]
    for yy in range(size):
        for xx in range(size):
            # نجمع الغطاء بتقنية supersampling
            acc_r = acc_g = acc_b = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = xx + (sx + 0.5) / SS
                    y = yy + (sy + 0.5) / SS
                    color = (0, 0, 0)
                    alpha = 0
                    if in_rounded_square(x - pad, y - pad, inner, inner * 0.22):
                        color = BG
                        alpha = 1
                        d = math.hypot(x - cx, y - cy)
                        # الطبق (حلقة بيضاء)
                        if plate_inner <= d <= plate_r:
                            color = PLATE
                        # رأس الشوكة والأسنان
                        elif abs(x - fork_x) <= handle_w and cy - plate_r * 1.05 <= y <= cy:
                            color = FORK
                        elif cy - plate_r * 1.25 <= y <= cy - plate_r * 0.75 and abs(x - fork_x) <= handle_w * 1.6:
                            color = FORK
                        elif abs(y - (cy - plate_r * 1.0)) <= inner * 0.05:
                            for i in range(-1, 3):
                                if abs(x - (fork_x + i * tine_gap)) <= inner * 0.012:
                                    color = FORK
                    acc_r += color[0] * alpha
                    acc_g += color[1] * alpha
                    acc_b += color[2] * alpha
            n = SS * SS
            px[yy][xx] = (round(acc_r / n), round(acc_g / n), round(acc_b / n))
    return px


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    targets = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('maskable-512.png', 512, True),
        ('apple-touch-icon.png', 180, False),
        ('favicon.png', 64, False),
    ]
    for name, size, maskable in targets:
        write_png(os.path.join(OUT_DIR, name), size, size, render(size, maskable))
        print('✓', name, f'{size}x{size}')
    # أيقونة SVG خفيفة للمتصفح
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#E85D2A"/>
  <circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="6"/>
  <path d="M45 13v14M41 13v10M49 13v10M45 27v24" stroke="#FFD8A8" stroke-width="3" stroke-linecap="round"/>
</svg>'''
    with open(os.path.join(OUT_DIR, 'icon.svg'), 'w', encoding='utf8') as fh:
        fh.write(svg)
    print('✓ icon.svg')


if __name__ == '__main__':
    main()
