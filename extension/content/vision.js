// BrowserAgent AI - Vision Engine
// Screenshot capture + coordinate mapping + visual analysis

export class VisionEngine {
  constructor() {
    this.screenshots = [];
    this.elementMap = new Map();
  }

  // Capture screenshot via background service worker
  async captureScreenshot() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'CAPTURE_SCREENSHOT' },
        (response) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            this.screenshots.push({
              dataUrl: response.dataUrl,
              timestamp: Date.now(),
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                scrollX: window.scrollX,
                scrollY: window.scrollY
              }
            });
            resolve(response.dataUrl);
          }
        }
      );
    });
  }

  // Map visual coordinates to DOM elements
  getElementAtCoordinate(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;

    return {
      element,
      tag: element.tagName,
      text: element.textContent?.substring(0, 100).trim(),
      attributes: this.getAttributes(element),
      bbox: element.getBoundingClientRect(),
      computedStyle: this.getComputedStyles(element)
    };
  }

  getAttributes(element) {
    const attrs = {};
    for (const attr of element.attributes || []) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  getComputedStyles(element) {
    const style = window.getComputedStyle(element);
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      position: style.position,
      zIndex: style.zIndex,
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize
    };
  }

  // Highlight element for visual feedback
  highlightElement(element, duration = 2000) {
    const originalOutline = element.style.outline;
    const originalZIndex = element.style.zIndex;
    
    element.style.outline = '3px solid #00ff00';
    element.style.zIndex = '999999';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.zIndex = originalZIndex;
    }, duration);
  }

  // Create visual overlay for debugging
  createVisualOverlay(elements) {
    // Remove existing overlay
    const existing = document.getElementById('browseragent-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'browseragent-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 999999;
    `;

    for (const el of elements) {
      const bbox = el.getBoundingClientRect();
      const marker = document.createElement('div');
      marker.style.cssText = `
        position: absolute;
        left: ${bbox.left}px;
        top: ${bbox.top}px;
        width: ${bbox.width}px;
        height: ${bbox.height}px;
        border: 2px solid #00ff00;
        background: rgba(0, 255, 0, 0.1);
        pointer-events: none;
      `;
      overlay.appendChild(marker);
    }

    document.body.appendChild(overlay);
    
    // Auto-remove after 3 seconds
    setTimeout(() => overlay.remove(), 3000);
  }

  // Get all interactive elements with coordinates
  getInteractiveElements() {
    const selectors = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[onclick]',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[contenteditable="true"]'
    ];

    const elements = [];
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      for (const el of found) {
        if (this.isVisible(el)) {
          elements.push({
            element: el,
            bbox: el.getBoundingClientRect(),
            tag: el.tagName,
            text: el.textContent?.substring(0, 50).trim(),
            type: el.type,
            value: el.value,
            href: el.href
          });
        }
      }
    }
    return elements;
  }

  isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const bbox = element.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      bbox.width > 0 &&
      bbox.height > 0
    );
  }

  // Generate annotated screenshot with element markers
  async captureAnnotatedScreenshot() {
    const screenshot = await this.captureScreenshot();
    const interactiveElements = this.getInteractiveElements();
    
    return {
      screenshot,
      elements: interactiveElements.map((el, idx) => ({
        id: `elem_${idx}`,
        bbox: el.bbox,
        tag: el.tag,
        text: el.text,
        type: el.type,
        interactive: true
      })),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }
}

// Initialize vision engine
if (typeof window !== 'undefined') {
  window.__visionEngine = new VisionEngine();
  console.log('[BrowserAgent Vision] Engine initialized');
}
