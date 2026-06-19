#!/usr/bin/env bash
# VM UI smoke test: focus app, navigate to Evidence tab
set -euo pipefail

export DISPLAY="${DISPLAY:-:1}"

WIN=$(xdotool search --name "AccoutingStandards Desktop" 2>/dev/null | head -1 || true)
if [[ -z "${WIN}" ]]; then
  echo "✗ 未找到 AccoutingStandards Desktop 窗口"
  exit 1
fi

echo "== UI 冒烟测试 =="
echo "  窗口 ID: ${WIN}"

DIALOG=$(xdotool search --name "Select Folder" 2>/dev/null | head -1 || true)
if [[ -n "${DIALOG}" ]]; then
  xdotool key --window "${DIALOG}" Escape 2>/dev/null || true
  sleep 0.3
  echo "  ✓ 已关闭文件夹选择对话框"
fi

xdotool windowactivate --sync "${WIN}"
sleep 0.5

# Parse geometry: "  Position: 2,85 (screen: 0)" and "  Geometry: 1280x840"
read -r POS_X POS_Y WIDTH HEIGHT < <(
  xdotool getwindowgeometry "${WIN}" | awk '
    /Position:/ { gsub(/[^0-9,]/,"",$2); split($2,a,","); px=a[1]; py=a[2] }
    /Geometry:/ { gsub(/[^0-9x]/,"",$2); split($2,a,"x"); w=a[1]; h=a[2] }
    END { print px, py, w, h }
  '
)

CLICK_X=$((POS_X + WIDTH * 72 / 100))
CLICK_Y=$((POS_Y + 45))
xdotool mousemove "${CLICK_X}" "${CLICK_Y}" click 1
sleep 1

echo "  ✓ 已点击 Evidence 导航 (${CLICK_X}, ${CLICK_Y})"
echo "UI 冒烟测试完成（请在 VM 中确认三栏 Evidence 布局）"
