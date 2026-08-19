import '@testing-library/jest-dom'

// jsdom does not implement pointer capture; @use-gesture/react calls these on
// pointerdown, so provide no-op stubs so drag gestures work in tests.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
}
