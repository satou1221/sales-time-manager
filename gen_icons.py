from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, path):
    img = Image.new('RGB', (size, size), color='#2c4a5e')
    draw = ImageDraw.Draw(img)

    # 外枠の円
    margin = size * 0.08
    draw.ellipse([margin, margin, size-margin, size-margin], fill='#3d6f8a')

    # テキスト「業務」
    try:
        font_large = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', int(size * 0.28))
        font_small = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', int(size * 0.16))
    except:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # 時計アイコン的な円
    cx, cy = size // 2, size // 2
    r = int(size * 0.3)
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline='white', width=max(2, size//40))

    # 時計の針
    import math
    # 時針（10時方向）
    angle_h = math.radians(-60)
    hlen = r * 0.55
    draw.line([cx, cy, cx + hlen*math.sin(angle_h), cy - hlen*math.cos(angle_h)],
              fill='white', width=max(2, size//40))
    # 分針（2時方向）
    angle_m = math.radians(60)
    mlen = r * 0.75
    draw.line([cx, cy, cx + mlen*math.sin(angle_m), cy - mlen*math.cos(angle_m)],
              fill='white', width=max(1, size//60))

    # 中心点
    cr = max(3, size//30)
    draw.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], fill='white')

    # 下部テキスト
    text = '業務時間'
    try:
        bbox = draw.textbbox((0,0), text, font=font_small)
        tw = bbox[2] - bbox[0]
        tx = (size - tw) // 2
        ty = int(size * 0.72)
        draw.text((tx, ty), text, fill='white', font=font_small)
    except:
        pass

    img.save(path, 'PNG')
    print(f'Created: {path} ({size}x{size})')

create_icon(192, '/home/ubuntu/sales-time-manager/icons/icon-192.png')
create_icon(512, '/home/ubuntu/sales-time-manager/icons/icon-512.png')
print('Done')
