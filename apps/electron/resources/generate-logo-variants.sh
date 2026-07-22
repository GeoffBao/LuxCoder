#!/bin/bash

# 从统一的 LuxCoder L 母版生成设置页与品牌下载使用的全部图标变体。
# Requires: ImageMagick (magick)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGOS_DIR="$SCRIPT_DIR/logos"
MARK_SVG="$LOGOS_DIR/luxcoder-mark.svg"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/luxcoder-logo-variants.XXXXXX")"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

if ! command -v magick >/dev/null 2>&1; then
  echo "❌ ImageMagick (magick) not found. Install with: brew install imagemagick"
  exit 1
fi

if [ ! -f "$MARK_SVG" ]; then
  echo "❌ LuxCoder mark not found: $MARK_SVG"
  exit 1
fi

make_mask() {
  magick -size 1024x1024 xc:none -fill white \
    -draw "roundrectangle 96,88 928,920 190,190" \
    "$TEMP_DIR/shell-mask.png"

  magick -background none "$MARK_SVG" -alpha extract \
    "$TEMP_DIR/mark-mask.png"

  magick -size 1024x1024 xc:none -stroke white -strokewidth 8 \
    -draw "line 360,756 482,640" \
    "$TEMP_DIR/cut-mask.png"
}

masked_gradient() {
  local top_color="$1"
  local bottom_color="$2"
  local mask_path="$3"
  local output_path="$4"

  magick -size 1024x1024 "gradient:${top_color}-${bottom_color}" \
    "$mask_path" -alpha off -compose CopyOpacity -composite \
    "$output_path"
}

shadow_from_mask() {
  local mask_path="$1"
  local opacity="$2"
  local blur="$3"
  local output_path="$4"

  magick -size 1024x1024 "xc:rgba(0,0,0,${opacity})" \
    "$mask_path" -alpha off -compose CopyOpacity -composite \
    -channel A -blur "0x${blur}" +channel \
    "$output_path"
}

render_variant() {
  local id="$1"
  local shell_top="$2"
  local shell_bottom="$3"
  local mark_top="$4"
  local mark_bottom="$5"
  local cut_color="$6"

  masked_gradient "$shell_top" "$shell_bottom" "$TEMP_DIR/shell-mask.png" "$TEMP_DIR/shell.png"
  masked_gradient "$mark_top" "$mark_bottom" "$TEMP_DIR/mark-mask.png" "$TEMP_DIR/mark.png"
  shadow_from_mask "$TEMP_DIR/shell-mask.png" 0.30 22 "$TEMP_DIR/shell-shadow.png"
  shadow_from_mask "$TEMP_DIR/mark-mask.png" 0.42 12 "$TEMP_DIR/mark-shadow.png"

  magick -size 1024x1024 xc:none \
    "$TEMP_DIR/shell-shadow.png" -compose over -composite \
    "$TEMP_DIR/shell.png" -compose over -composite \
    "$TEMP_DIR/mark-shadow.png" -compose over -composite \
    "$TEMP_DIR/mark.png" -compose over -composite \
    -stroke 'rgba(255,255,255,0.16)' -strokewidth 3 -fill none \
    -draw "roundrectangle 98,90 926,918 188,188" \
    "$TEMP_DIR/base-${id}.png"

  magick -size 1024x1024 "xc:${cut_color}" \
    "$TEMP_DIR/cut-mask.png" -alpha off -compose CopyOpacity -composite \
    "$TEMP_DIR/cut.png"

  magick "$TEMP_DIR/base-${id}.png" "$TEMP_DIR/cut.png" \
    -compose over -composite "$LOGOS_DIR/${id}.png"
}

render_transparent() {
  masked_gradient '#34373D' '#111318' "$TEMP_DIR/mark-mask.png" "$TEMP_DIR/transparent-mark.png"
  magick -size 1024x1024 xc:none "$TEMP_DIR/transparent-mark.png" \
    -compose over -composite "$LOGOS_DIR/transparent.png"
}

make_mask

# 基础色系
render_variant black '#24262B' '#08090B' '#FFFFFF' '#D7D9DE' 'rgba(255,255,255,0.72)'
render_variant white '#FFFFFF' '#ECEDEF' '#30333A' '#111318' 'rgba(255,255,255,0.76)'
render_variant blue '#244A9A' '#10265E' '#FFFFFF' '#BFD3FF' 'rgba(255,255,255,0.80)'
render_variant purple '#6D35A7' '#35125F' '#FFFFFF' '#DFC8FF' 'rgba(255,255,255,0.82)'
render_variant gradient '#1677FF' '#8B28ED' '#FFFFFF' '#D7D8FF' 'rgba(255,255,255,0.86)'
render_transparent

# 潘通色系
render_variant coral '#FF7C70' '#D94D43' '#FFF8F0' '#FFD8C8' 'rgba(255,255,255,0.76)'
render_variant veri-peri '#7B7CC5' '#4E4F8E' '#FFFFFF' '#D9DAFF' 'rgba(255,255,255,0.78)'
render_variant viva-magenta '#CC3159' '#7F1232' '#FFF4F6' '#FFC4D1' 'rgba(255,255,255,0.76)'
render_variant mocha-mousse '#B58A74' '#76513F' '#FFF5E8' '#E9C8AA' 'rgba(255,255,255,0.72)'
render_variant emerald '#08A982' '#006A55' '#F2FFF9' '#B7F2DC' 'rgba(255,255,255,0.80)'

# 科技风格：仍保持同一 L 骨架，只改变渲染语言。
render_variant 8bit '#171725' '#06060B' '#32F6FF' '#FF34D2' 'rgba(255,255,255,0.92)'
magick "$LOGOS_DIR/8bit.png" -filter point -resize 128x128 -resize 1024x1024 "$LOGOS_DIR/8bit.png"

render_variant cyberpunk '#120022' '#030007' '#00F5FF' '#FF2AAE' 'rgba(255,255,255,0.94)'
magick "$LOGOS_DIR/cyberpunk.png" \
  \( +clone -channel A -blur 0x10 -channel RGB -fill '#FF20D0' -colorize 70 \) \
  +swap -compose screen -composite "$LOGOS_DIR/cyberpunk.png"

render_variant futuristic '#555B64' '#171A20' '#E8FFFF' '#B9A4FF' 'rgba(255,255,255,0.96)'
magick "$LOGOS_DIR/futuristic.png" \
  -colorspace HSL -channel G -evaluate multiply 1.18 +channel -colorspace sRGB \
  "$LOGOS_DIR/futuristic.png"

echo "✅ Generated 14 LuxCoder logo variants in $LOGOS_DIR"
