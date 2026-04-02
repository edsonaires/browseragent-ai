// BrowserAgent AI - Content Script - DOM Agent Controller
// Ultra-fast DOM manipulation and action execution

class BrowserAgentDOM {
  constructor() {
    this.initialized = false;
    this.refMap = new Map(); // ref_id -> element mapping
    this.refCounter = 0;
    this.init();
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('[BrowserAgent DOM] Initialized on', window.location.href);
    window.__browserAgent = this;
  }

  // =============== ELEMENT FINDING ===============

  // Smart element finder - tries multiple strategies
  findElement(selector, options = {}) {
    const { timeout = 5000, retries = 3 } = options;
    const strategies = [
      () => document.querySelector(selector),
      () => this.findByXPath(selector),
      () => this.findByText(selector),
      () => this.findByAriaLabel(selector),
      () => this.findInShadowDOM(selector)
    ];

    for (const strategy of strategies) {
      try {
        const element = strategy();
        if (element) return element;
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  findByXPath(xpath) {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue;
  }

  findByText(text) {
    const xpath = `//*[contains(text(), '${text}')]`;
    return this.findByXPath(xpath);
  }

  findByAriaLabel(label) {
    return document.querySelector(`[aria-label*="${label}"]`);
  }

  // Recursive shadow DOM search
  findInShadowDOM(selector, root = document.body) {
    const found = root.querySelector(selector);
    if (found) return found;

    const shadowHosts = root.querySelectorAll('*');
    for (const host of shadowHosts) {
      if (host.shadowRoot) {
        const found = this.findInShadowDOM(selector, host.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  // =============== ACTION EXECUTION ===============

  async execute(action) {
    const { type, selector, value, coordinate, ref } = action;

    try {
      let element = ref ? this.refMap.get(ref) : null;
      if (!element && selector) {
        element = this.findElement(selector);
      }
      if (!element && coordinate) {
        element = document.elementFromPoint(coordinate.x, coordinate.y);
      }

      switch (type) {
        case 'click':
          return await this.click(element, coordinate);
        case 'type':
          return await this.type(element, value);
        case 'scroll':
          return await this.scroll(element, value);
        case 'hover':
          return await this.hover(element);
        case 'select':
          return await this.select(element, value);
        case 'checkbox':
          return await this.checkbox(element, value);
        case 'navigate':
          window.location.href = value;
          return { success: true };
        case 'wait':
          await new Promise(r => setTimeout(r, value || 1000));
          return { success: true };
        default:
          return { error: `Unknown action type: ${type}` };
      }
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  }

  // Ultra-fast click with all event triggers
  async click(element, coordinate) {
    if (!element && coordinate) {
      element = document.elementFromPoint(coordinate.x, coordinate.y);
    }
    if (!element) return { error: 'Element not found' };

    // Scroll into view first
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 100));

    // Fire all events
    const events = ['mouseover', 'mousedown', 'mouseup', 'click'];
    for (const eventType of events) {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: eventType === 'click' ? 1 : 0
      });
      element.dispatchEvent(event);
    }

    // Also try native click
    if (element.click) element.click();

    return { success: true, element: this.getElementInfo(element) };
  }

  // Type with React/Vue compatibility
  async type(element, text) {
    if (!element) return { error: 'Element not found' };

    element.focus();
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Clear existing value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, '');
    } else {
      element.value = '';
    }

    // Trigger input events for React/Vue
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Type character by character for realism
    for (const char of text) {
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, element.value + char);
      } else {
        element.value += char;
      }
      
      // Fire keyboard events
      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      element.dispatchEvent(new InputEvent('input', { data: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      
      await new Promise(r => setTimeout(r, 10)); // Natural typing speed
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    return { success: true, value: element.value };
  }

  async scroll(element, direction) {
    const target = element || window;
    const amount = direction?.amount || 500;
    
    if (direction === 'down' || !direction) {
      target.scrollBy({ top: amount, behavior: 'smooth' });
    } else if (direction === 'up') {
      target.scrollBy({ top: -amount, behavior: 'smooth' });
    } else if (direction === 'bottom') {
      target.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else if (direction === 'top') {
      target.scrollTo({ top: 0, behavior: 'smooth' });
    }

    return { success: true };
  }

  async hover(element) {
    if (!element) return { error: 'Element not found' };
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    return { success: true };
  }

  async select(element, value) {
    if (!element || element.tagName !== 'SELECT') return { error: 'Not a select element' };
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, value: element.value };
  }

  async checkbox(element, checked) {
    if (!element || element.type !== 'checkbox') return { error: 'Not a checkbox' };
    element.checked = checked;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, checked: element.checked };
  }

  // =============== PAGE READING ===============

  // Build accessibility tree (similar to Comet's read_page)
  buildAccessibilityTree(options = {}) {
    const { depth = 15, filter = 'all', rootElement = document.body } = options;
    const tree = [];
    let refCounter = 1;

    const traverse = (element, currentDepth = 0) => {
      if (currentDepth > depth) return;
      if (!element) return;

      const isInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) ||
                           element.onclick || element.hasAttribute('role');

      if (filter === 'interactive' && !isInteractive) {
        for (const child of element.children) traverse(child, currentDepth + 1);
        return;
      }

      const ref = `ref_${refCounter++}`;
      this.refMap.set(ref, element);

      const node = {
        ref,
        tag: element.tagName,
        text: element.textContent?.substring(0, 100).trim(),
        attributes: this.getAttributes(element),
        interactive: isInteractive,
        visible: this.isVisible(element),
        bbox: element.getBoundingClientRect()
      };

      tree.push(node);

      // Traverse children
      for (const child of element.children) {
        traverse(child, currentDepth + 1);
      }

      // Shadow DOM
      if (element.shadowRoot) {
        for (const child of element.shadowRoot.children) {
          traverse(child, currentDepth + 1);
        }
      }
    };

    traverse(rootElement);
    return tree;
  }

  getAttributes(element) {
    const attrs = {};
    for (const attr of element.attributes || []) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  getElementInfo(element) {
    if (!element) return null;
    return {
      tag: element.tagName,
      text: element.textContent?.substring(0, 100),
      value: element.value,
      href: element.href,
      src: element.src,
      bbox: element.getBoundingClientRect()
    };
  }

  // =============== PAGE CONTEXT ===============

  getPageContext() {
    return {
      url: window.location.href,
      title: document.title,
      html: document.documentElement.outerHTML.substring(0, 50000),
      tree: this.buildAccessibilityTree({ depth: 10 }),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      }
    };
  }
}

// Initialize agent
const agent = new BrowserAgentDOM();
console.log('[BrowserAgent] Content script loaded');

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TREE') {
    const tree = agent.buildAccessibilityTree(message.options);
    sendResponse({ success: true, tree });
  } else if (message.type === 'GET_CONTEXT') {
    const context = agent.getPageContext();
    sendResponse({ success: true, context });
  } else if (message.type === 'EXECUTE') {
    agent.execute(message.action).then(result => {
      sendResponse({ success: true, result });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true; // Async response
  }
  return true;
});
