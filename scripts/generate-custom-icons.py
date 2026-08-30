#!/usr/bin/env python3
"""
Custom Icon Generator for Claude 5-Hour Reset Automation
Generates distinctive, beautiful icons (16x16, 48x48, 128x128) using pure Python + zlib.
"""
import zlib
import struct
import math
import os

def create_png(width, height, get_pixel_func):
    """Encodes RGBA pixel data into a standard PNG file."""
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # Filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y, width, height)
            raw_data.extend((
                max(0, min(255, int(r))),
                max(0, min(255, int(g))),
                max(0, min(255, int(b))),
                max(0, min(255, int(a)))
            ))
    
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    png += struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # IDAT chunk
    compressed = zlib.compress(bytes(raw_data), 9)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    return png

def render_icon_pixel(x, y, w, h):
    # Normalized coordinates from -1.0 to 1.0
    nx = (x + 0.5) / w * 2.0 - 1.0
    ny = (y + 0.5) / h * 2.0 - 1.0
    
    # 1. Rounded rectangle container
    corner_radius = 0.35
    ax = abs(nx)
    ay = abs(ny)
    
    # Distance to rounded rect boundary
    dx = max(0.0, ax - (1.0 - corner_radius))
    dy = max(0.0, ay - (1.0 - corner_radius))
    dist_outside = math.sqrt(dx*dx + dy*dy)
    
    pixel_size = 2.0 / w
    if dist_outside > corner_radius:
        return 0, 0, 0, 0  # Transparent outside rounded squircle
    
    # Antialiasing at container border
    edge_alpha = 1.0
    if dist_outside > corner_radius - pixel_size:
        edge_alpha = max(0.0, min(1.0, (corner_radius - dist_outside) / pixel_size))
    
    # Background gradient: Deep Indigo/Purple (#1E1B4B -> #4338CA)
    t = (ny + 1.0) / 2.0
    bg_r = 30 * (1 - t) + 67 * t
    bg_g = 27 * (1 - t) + 56 * t
    bg_b = 75 * (1 - t) + 202 * t
    
    r, g, b = bg_r, bg_g, bg_b
    
    # 2. Draw Cyan/Turquoise Glowing Circular Reset Arrow
    radius = math.sqrt(nx*nx + ny*ny)
    angle = math.atan2(ny, nx) # -pi to pi
    
    ring_r = 0.58
    ring_thick = 0.14
    dist_to_ring = abs(radius - ring_r)
    
    # Gap in the circular arrow at the top-right (angle between 0.3 and 0.8 rad)
    in_gap = (0.2 < angle < 0.9)
    
    if dist_to_ring < ring_thick and not in_gap:
        # Ring intensity with antialiasing
        ring_aa = max(0.0, min(1.0, (ring_thick - dist_to_ring) / pixel_size))
        # Electric Cyan / Turquoise (#06B6D4 -> #38BDF8)
        arrow_r = 6
        arrow_g = 182
        arrow_b = 212
        r = r * (1 - ring_aa) + arrow_r * ring_aa
        g = g * (1 - ring_aa) + arrow_g * ring_aa
        b = b * (1 - ring_aa) + arrow_b * ring_aa
    
    # 3. Arrowhead at the end of the circular ring (near angle 0.3)
    arrow_tip_x = 0.50
    arrow_tip_y = 0.30
    d_arrowhead = math.sqrt((nx - arrow_tip_x)**2 + (ny - arrow_tip_y)**2)
    if d_arrowhead < 0.18:
        ah_aa = max(0.0, min(1.0, (0.18 - d_arrowhead) / pixel_size))
        r = r * (1 - ah_aa) + 56 * ah_aa
        g = g * (1 - ah_aa) + 189 * ah_aa
        b = b * (1 - ah_aa) + 248 * ah_aa
        
    # 4. Glowing Amber/Gold Center Spark/Core (Claude automation pulse)
    center_dist = math.sqrt(nx*nx + ny*ny)
    core_r = 0.22
    if center_dist < core_r:
        core_aa = max(0.0, min(1.0, (core_r - center_dist) / pixel_size))
        # Electric Amber/Gold Core (#F59E0B -> #FDE047)
        core_cr = 245
        core_cg = 158
        core_cb = 11
        r = r * (1 - core_aa) + core_cr * core_aa
        g = g * (1 - core_aa) + core_cg * core_aa
        b = b * (1 - core_aa) + core_cb * core_aa
        
    return r, g, b, 255 * edge_alpha

def generate_icons(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    sizes = [16, 48, 128]
    for sz in sizes:
        png_data = create_png(sz, sz, render_icon_pixel)
        file_path = os.path.join(out_dir, f'icon{sz}.png')
        with open(file_path, 'wb') as f:
            f.write(png_data)
        print(f"✅ Generated {file_path} ({sz}x{sz})")

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(script_dir, '..'))
    
    src_icons_dir = os.path.join(root_dir, 'src', 'icons')
    dist_icons_dir = os.path.join(root_dir, 'dist', 'icons')
    
    print("🎨 Generating custom distinctive icons for Claude Reset Automation...")
    generate_icons(src_icons_dir)
    generate_icons(dist_icons_dir)
    print("🎉 Custom icons created successfully!")
