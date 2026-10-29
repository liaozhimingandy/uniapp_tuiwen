#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成 tabBar 图标（纯标准库，不依赖 Pillow / 网络）

为什么自己画：
  tabBar 的 iconPath 是二进制 PNG，直接手写 base64 不可维护；
  而 uni-app 允许不配图标（只显示文字），但那样底部导航辨识度太低。
  这里用「解析式描述形状 + 3x3 超采样」生成 81x81 的 RGBA PNG，
  产物体积可控（每个 1~2KB），且改颜色/改形状只需要改本文件重新跑。

用法：
  python scripts/gen-icons.py
产物：
  src/static/tabbar/{home,snap,me}{,-active}.png
  src/static/logo.png
"""

import math
import os
import struct
import zlib

SIZE = 81
SS = 3  # 每个像素 3x3 超采样，用来做边缘抗锯齿
GRAY = (0x8A, 0x8A, 0x8A)
BLUE = (0x02, 0x7A, 0xFF)
WHITE = (0xFF, 0xFF, 0xFF)


# ----------------------------- PNG 编码 -----------------------------
def write_png(path, pixels, width, height):
    """pixels: 二维列表，每项 (r,g,b,a)"""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)


# ----------------------------- 形状工具 -----------------------------
def in_polygon(x, y, pts):
    """射线法判断点是否在多边形内"""
    inside = False
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xt = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < xt:
                inside = not inside
    return inside


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_ellipse(x, y, cx, cy, rx, ry):
    if rx <= 0 or ry <= 0:
        return False
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0


def in_ring(x, y, cx, cy, r_out, r_in):
    return in_circle(x, y, cx, cy, r_out) and not in_circle(x, y, cx, cy, r_in)


# ----------------------------- 图标形状 -----------------------------
# 坐标系统一按 27x27 设计，绘制时乘以 (SIZE/27) 缩放


def shape_home(x, y):
    """房子：屋顶三角 + 屋身矩形（描边）"""
    s = SIZE / 27.0
    px, py = x * s, y * s
    w = 2.4 * s  # 线宽
    # 屋顶外轮廓
    roof = [(13.5 * s, 3.6 * s), (24.4 * s, 13.0 * s), (2.6 * s, 13.0 * s)]
    # 屋身外轮廓（底部留空）
    body_out = [
        (5.2 * s, 12.0 * s),
        (21.8 * s, 12.0 * s),
        (21.8 * s, 23.4 * s),
        (5.2 * s, 23.4 * s),
    ]
    inner = w
    roof_in = [
        (13.5 * s, 3.6 * s + inner * 1.9),
        (24.4 * s - inner * 1.5, 13.0 * s - inner * 0.55),
        (2.6 * s + inner * 1.5, 13.0 * s - inner * 0.55),
    ]
    body_in = [
        (5.2 * s + inner, 12.0 * s),
        (21.8 * s - inner, 12.0 * s),
        (21.8 * s - inner, 23.4 * s - inner),
        (5.2 * s + inner, 23.4 * s - inner),
    ]
    if in_polygon(px, py, roof) and not in_polygon(px, py, roof_in):
        return True
    if in_polygon(px, py, body_out) and not in_polygon(px, py, body_in):
        return True
    return False


def shape_moon(x, y):
    """月亮：外圆减去偏移圆"""
    s = SIZE / 27.0
    px, py = x * s, y * s
    outer = in_circle(px, py, 13.5 * s, 13.5 * s, 9.6 * s)
    cut = in_circle(px, py, 19.4 * s, 9.4 * s, 8.2 * s)
    return outer and not cut


def shape_me(x, y):
    """人像：头部圆 + 肩部半椭圆（描边）"""
    s = SIZE / 27.0
    px, py = x * s, y * s
    head = in_ring(px, py, 13.5 * s, 9.6 * s, 4.7 * s, 3.0 * s)
    # 肩部：外椭圆与内椭圆的差集，只保留上半部分
    if py >= 15.4 * s:
        body = in_ellipse(px, py, 13.5 * s, 24.6 * s, 8.6 * s, 8.0 * s) and not in_ellipse(
            px, py, 13.5 * s, 24.6 * s, 6.9 * s, 6.3 * s
        )
    else:
        body = False
    return head or body


def render(shape_fn, color):
    """按形状函数渲染一张图"""
    rows = []
    for py in range(SIZE):
        row = []
        for px in range(SIZE):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    if shape_fn(x * 27.0 / SIZE, y * 27.0 / SIZE):
                        hits += 1
            alpha = int(round(255 * hits / (SS * SS)))
            row.append((color[0], color[1], color[2], alpha))
        rows.append(row)
    return rows


def render_logo():
    """应用图标：圆角方块 + 三条文字线 + 一个蓝点，纯几何，不依赖字体"""
    rows = []
    radius = SIZE * 0.24
    for py in range(SIZE):
        row = []
        for px in range(SIZE):
            # 圆角矩形遮罩
            dx = max(radius - px, px - (SIZE - 1 - radius), 0)
            dy = max(radius - py, py - (SIZE - 1 - radius), 0)
            if (dx * dx + dy * dy) ** 0.5 > radius:
                row.append((0, 0, 0, 0))
                continue
            u, v = px / SIZE, py / SIZE
            # 三条白线
            lines = [(0.30, 0.44), (0.30, 0.56), (0.30, 0.68)]
            on_line = any(
                0.24 <= u <= 0.62 + (0.06 if i == 2 else 0) and abs(v - y0) <= 0.032
                for i, (x0, y0) in enumerate(lines)
            )
            # 右下角白点
            dot = (u - 0.70) ** 2 + (v - 0.68) ** 2 <= 0.085 ** 2
            if on_line or dot:
                row.append((255, 255, 255, 255))
            else:
                row.append((BLUE[0], BLUE[1], BLUE[2], 255))
        rows.append(row)
    return rows


def main():
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "static")
    out = os.path.join(root, "tabbar")
    os.makedirs(out, exist_ok=True)

    icons = {"home": shape_home, "snap": shape_moon, "me": shape_me}
    for name, fn in icons.items():
        write_png(os.path.join(out, f"{name}.png"), render(fn, GRAY), SIZE, SIZE)
        write_png(os.path.join(out, f"{name}-active.png"), render(fn, BLUE), SIZE, SIZE)
        print(f"generated tabbar/{name}.png, tabbar/{name}-active.png")

    write_png(os.path.join(root, "logo.png"), render_logo(), SIZE, SIZE)
    print("generated logo.png")


if __name__ == "__main__":
    main()
