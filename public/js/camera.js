const Camera = (() => {
  let x = 0, y = 0;
  let zoom = 1;
  let minZoom = 1, maxZoom = 4;
  let canvasW = 0, canvasH = 0;
  let gridPixelSize = 0;
  let cellSize = 0;

  let isPanning = false;
  let lastPanX = 0, lastPanY = 0;

  let isPinching = false;
  let lastPinchDist = 0;
  let pinchCenterX = 0, pinchCenterY = 0;

  function init(cw, ch) {
    canvasW = cw;
    canvasH = ch;
    cellSize = Math.floor(Math.min(cw, ch) / GRID_W);
    gridPixelSize = cellSize * GRID_W;
    zoom = 1;
    centerView();
  }

  function centerView() {
    x = (canvasW - gridPixelSize * zoom) / 2;
    y = (canvasH - gridPixelSize * zoom) / 2;
  }

  function clampPosition() {
    const scaledSize = gridPixelSize * zoom;
    if (scaledSize <= canvasW) {
      x = (canvasW - scaledSize) / 2;
    } else {
      x = Math.min(0, Math.max(canvasW - scaledSize, x));
    }
    if (scaledSize <= canvasH) {
      y = (canvasH - scaledSize) / 2;
    } else {
      y = Math.min(0, Math.max(canvasH - scaledSize, y));
    }
  }

  function screenToGrid(sx, sy) {
    const gx = Math.floor((sx - x) / (cellSize * zoom));
    const gy = Math.floor((sy - y) / (cellSize * zoom));
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return null;
    return { x: gx, y: gy };
  }

  function gridToScreen(gx, gy) {
    return {
      x: x + gx * cellSize * zoom,
      y: y + gy * cellSize * zoom,
      size: cellSize * zoom,
    };
  }

  function handleTouchStart(touches) {
    if (touches.length === 2) {
      isPinching = true;
      isPanning = false;
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      pinchCenterX = (touches[0].clientX + touches[1].clientX) / 2;
      pinchCenterY = (touches[0].clientY + touches[1].clientY) / 2;
    } else if (touches.length === 1 && zoom > 1.05) {
      isPanning = true;
      lastPanX = touches[0].clientX;
      lastPanY = touches[0].clientY;
    }
  }

  function handleTouchMove(touches) {
    if (isPinching && touches.length === 2) {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newCx = (touches[0].clientX + touches[1].clientX) / 2;
      const newCy = (touches[0].clientY + touches[1].clientY) / 2;

      const scale = dist / lastPinchDist;
      const oldZoom = zoom;
      zoom = Math.min(maxZoom, Math.max(minZoom, zoom * scale));

      const rect = document.getElementById('game-canvas').getBoundingClientRect();
      const px = pinchCenterX - rect.left;
      const py = pinchCenterY - rect.top;
      x = px - (px - x) * (zoom / oldZoom);
      y = py - (py - y) * (zoom / oldZoom);

      x += newCx - pinchCenterX;
      y += newCy - pinchCenterY;

      lastPinchDist = dist;
      pinchCenterX = newCx;
      pinchCenterY = newCy;
      clampPosition();
      return true;
    }

    if (isPanning && touches.length === 1) {
      const dx = touches[0].clientX - lastPanX;
      const dy = touches[0].clientY - lastPanY;
      x += dx;
      y += dy;
      lastPanX = touches[0].clientX;
      lastPanY = touches[0].clientY;
      clampPosition();
      return true;
    }

    return false;
  }

  function handleTouchEnd(touches) {
    if (touches.length < 2) isPinching = false;
    if (touches.length < 1) isPanning = false;
  }

  function resetZoom() {
    zoom = 1;
    centerView();
  }

  function getTransform() {
    return { x, y, zoom, cellSize };
  }

  function isZoomed() {
    return zoom > 1.05;
  }

  function wasPanningOrPinching() {
    return isPanning || isPinching;
  }

  return {
    init, centerView, screenToGrid, gridToScreen,
    handleTouchStart, handleTouchMove, handleTouchEnd,
    resetZoom, getTransform, isZoomed, wasPanningOrPinching,
  };
})();
