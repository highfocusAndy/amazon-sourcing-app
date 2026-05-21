export type AnchoredPopoverPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

/** ~72px per seller row × 4 rows + header/padding */
const SELLER_POPOVER_HEADER_PX = 88;
const SELLER_POPOVER_ROW_PX = 72;
const SELLER_POPOVER_MIN_ROWS = 4;

/** Positions the sellers list popover — tall enough for at least 4 rows, uses panel height. */
export function computeSellerListPopoverPosition(
  trigger: DOMRect,
  panel: DOMRect,
): AnchoredPopoverPosition {
  const margin = 8;
  const gap = 8;
  const viewportH = window.innerHeight;
  const desiredHeight =
    SELLER_POPOVER_HEADER_PX + SELLER_POPOVER_MIN_ROWS * SELLER_POPOVER_ROW_PX + 12;

  const box = {
    left: panel.left + margin,
    right: panel.right - margin,
    top: panel.top + margin,
    bottom: Math.min(viewportH - margin, panel.bottom - margin),
  };

  const width = Math.max(160, box.right - box.left);
  const panelInnerHeight = box.bottom - box.top;
  const maxHeight = Math.min(desiredHeight, panelInnerHeight);

  const spaceBelow = box.bottom - (trigger.bottom + gap);
  let top = trigger.bottom + gap;

  if (spaceBelow + SELLER_POPOVER_HEADER_PX < SELLER_POPOVER_ROW_PX * 2) {
    top = Math.max(box.top, box.bottom - maxHeight);
  } else if (top + maxHeight > box.bottom) {
    top = Math.max(box.top, box.bottom - maxHeight);
  }

  return { top, left: box.left, width, maxHeight };
}

/** Positions a popover inside a sidebar/panel — full panel width, below or above the trigger. */
export function computePanelPopoverPosition(
  trigger: DOMRect,
  panel: DOMRect,
): AnchoredPopoverPosition {
  const margin = 8;
  const viewportH = window.innerHeight;

  const box = {
    left: panel.left + margin,
    right: panel.right - margin,
    top: panel.top + margin,
    bottom: Math.min(viewportH - margin, panel.bottom - margin),
  };

  const width = Math.max(160, box.right - box.left);
  const left = box.left;

  const gap = 8;
  const maxHeightCap = Math.min(viewportH * 0.55, 360);
  const spaceBelow = box.bottom - (trigger.bottom + gap);
  const spaceAbove = trigger.top - gap - box.top;

  let top: number;
  let maxHeight: number;
  if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
    top = trigger.bottom + gap;
    maxHeight = Math.min(maxHeightCap, spaceBelow);
  } else {
    maxHeight = Math.min(maxHeightCap, spaceAbove);
    top = Math.max(box.top, trigger.top - gap - maxHeight);
    maxHeight = Math.min(maxHeight, trigger.top - gap - top);
  }

  maxHeight = Math.max(100, maxHeight);
  top = Math.max(box.top, Math.min(top, box.bottom - maxHeight));

  return { top, left, width, maxHeight };
}

/** Positions a popover near a trigger while staying inside optional container + viewport bounds. */
export function computeAnchoredPopoverPosition(
  trigger: DOMRect,
  container?: DOMRect | null,
  preferredWidth = 320,
): AnchoredPopoverPosition {
  if (container) {
    return computePanelPopoverPosition(trigger, container);
  }

  const margin = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  const box = {
    left: margin,
    top: margin,
    right: viewportW - margin,
    bottom: viewportH - margin,
  };

  const maxWidth = Math.max(160, box.right - box.left);
  const width = Math.min(preferredWidth, maxWidth);

  const triggerCenterX = trigger.left + trigger.width / 2;
  const boxCenterX = (box.left + box.right) / 2;
  let left = triggerCenterX >= boxCenterX ? trigger.right - width : trigger.left;
  left = Math.max(box.left, Math.min(left, box.right - width));

  const gap = 8;
  const maxHeightCap = Math.min(viewportH * 0.65, 420);
  const spaceBelow = box.bottom - (trigger.bottom + gap);
  const spaceAbove = trigger.top - gap - box.top;

  let top: number;
  let maxHeight: number;
  if (spaceBelow >= 140 || spaceBelow >= spaceAbove) {
    top = trigger.bottom + gap;
    maxHeight = Math.min(maxHeightCap, spaceBelow);
  } else {
    maxHeight = Math.min(maxHeightCap, spaceAbove);
    top = Math.max(box.top, trigger.top - gap - maxHeight);
    maxHeight = Math.min(maxHeight, trigger.top - gap - top);
  }

  maxHeight = Math.max(120, maxHeight);
  top = Math.max(box.top, Math.min(top, box.bottom - maxHeight));

  return { top, left, width, maxHeight };
}
