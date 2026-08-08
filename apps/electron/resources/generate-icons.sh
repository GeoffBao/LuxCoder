#!/bin/bash

# MyYoda Icon Generation Script
# Generates all required icon formats from icon-source.png / logos/mymind-menubar-icon.png
# Requires: iconutil (macOS), magick (ImageMagick)
# rsvg-convert 仅在缺少 icon-source.png、需要从 icon.svg 兜底生成时才用得到（可选）。

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🎨 Generating MyYoda icons..."

# Check required tools
if ! command -v magick &> /dev/null; then
    echo "❌ ImageMagick (magick) not found. Install with: brew install imagemagick"
    exit 1
fi

if ! command -v iconutil &> /dev/null; then
    echo "⚠️  iconutil not found (macOS only). Skipping .icns generation"
fi

# 1. Generate icon.png (1024x1024). Prefer raster icon-source.png when the app
# icon is imported from an existing macOS app; otherwise fall back to icon.svg.
echo "📦 Generating icon.png (1024x1024)..."
if [ -f "icon-source.png" ]; then
  if command -v sips &> /dev/null; then
    sips -z 1024 1024 icon-source.png --out icon.png > /dev/null 2>&1
  else
    magick icon-source.png -resize 1024x1024 icon.png
  fi
else
  if ! command -v rsvg-convert &> /dev/null; then
    echo "❌ 缺少 icon-source.png 且 rsvg-convert 未安装，无法从 icon.svg 生成图标。Install with: brew install librsvg"
    exit 1
  fi
  rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png
fi

# 2. Generate menubar/tray icons (multi-resolution for Retina displays)
echo "📦 Generating tray icons..."

# macOS 托盘图标规范：
# - 标准尺寸: 24x24px
# - @2x Retina: 48x48px
# - @3x 高分辨率: 72x72px
# 使用 "Template" 命名让 macOS 自动适配深色/浅色菜单栏。
# 直接从栅格母版缩放（母版已是黑色纯色 + alpha 通道，无需矢量中间产物）。
TRAY_MASTER="logos/mymind-menubar-icon.png"

if [ ! -f "$TRAY_MASTER" ]; then
  echo "⚠️  Tray icon master not found at $TRAY_MASTER, skipping tray icon generation"
else
  magick "$TRAY_MASTER" -resize 24x24 logos/iconTemplate.png
  magick "$TRAY_MASTER" -resize 48x48 "logos/iconTemplate@2x.png"
  magick "$TRAY_MASTER" -resize 72x72 "logos/iconTemplate@3x.png"

  echo "✅ Tray icons generated:"
  echo "   - logos/iconTemplate.png (24x24 @1x)"
  echo "   - logos/iconTemplate@2x.png (48x48 @2x Retina)"
  echo "   - logos/iconTemplate@3x.png (72x72 @3x)"
fi

# 3. Generate .icns (macOS app icon)
if command -v iconutil &> /dev/null; then
    echo "📦 Generating icon.icns..."

    # Create iconset directory
    mkdir -p icon.iconset

    # Generate all required sizes for macOS
    # Standard resolutions
    sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png      > /dev/null 2>&1
    sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png   > /dev/null 2>&1
    sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png      > /dev/null 2>&1
    sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png   > /dev/null 2>&1
    sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png    > /dev/null 2>&1
    sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png > /dev/null 2>&1
    sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png    > /dev/null 2>&1
    sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png > /dev/null 2>&1
    sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png    > /dev/null 2>&1
    sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png > /dev/null 2>&1

    # Convert to .icns
    iconutil -c icns icon.iconset -o icon.icns

    # Clean up
    rm -rf icon.iconset

    echo "✅ icon.icns generated"
else
    echo "⚠️  Skipping .icns generation (iconutil not available)"
fi

# 4. Generate .ico (Windows app icon)
echo "📦 Generating icon.ico..."
magick icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
echo "✅ icon.ico generated"

echo ""
echo "✅ All icons generated successfully!"
echo ""
echo "Generated files:"
echo "  - icon.png (1024x1024) - Linux & macOS Dock"
echo "  - icon.icns - macOS app icon"
echo "  - icon.ico - Windows app icon"
echo "  - logos/iconTemplate.png - macOS tray (24x24 @1x)"
echo "  - logos/iconTemplate@2x.png - macOS tray (48x48 @2x Retina)"
echo "  - logos/iconTemplate@3x.png - macOS tray (72x72 @3x)"
