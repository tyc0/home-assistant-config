// A minimal custom card implementing FLIP animation with a wave + wobble effect.
// Wraps any child cards you specify in "cards: []" and animates their reflow.

const LitElement = Object.getPrototypeOf(
  customElements.get("hui-view") || customElements.get("hui-panel-view")
);
const html = LitElement.prototype.html;

class FlipAnimatorCard extends LitElement {
  static get properties() {
    return {
      hass: {},
    };
  }

  setConfig(config) {
    if (!config || !config.cards) {
      throw new Error("No cards configured for flip-animator-card.");
    }
    this._config = config;

    // Prepare a MutationObserver for FLIP animations.
    if (!this._observer) {
      this._observer = new MutationObserver(() => this._flipAnimate());
    }

    // Inject wobble keyframes once.
    if (!document.getElementById("flip-animator-styles")) {
      const style = document.createElement("style");
      style.id = "flip-animator-styles";
      style.textContent = `
        @keyframes wobble {
          0% { transform: rotate(0deg); }
          20% { transform: rotate(-3deg); }
          40% { transform: rotate(3deg); }
          60% { transform: rotate(-3deg); }
          80% { transform: rotate(3deg); }
          100% { transform: rotate(0deg); }
        }
      `;
      document.head.appendChild(style);
    }

    this._createCards();
  }

  // Create all child cards from the config.
  async _createCards() {
    // If we already had cards rendered, remove them.
    if (this._cards) {
      this._cards.forEach((card) => {
        if (card.parentElement) {
          card.parentElement.removeChild(card);
        }
      });
    }

    this._cards = [];
    // Use Lovelace's built-in card helpers if available
    const helpers = await (window.loadCardHelpers && window.loadCardHelpers());
    for (const cardConfig of this._config.cards) {
      let element;
      if (helpers) {
        element = await helpers.createCardElement(cardConfig);
      } else {
        // Fallback: attempt standard element creation
        element = document.createElement(`hui-${cardConfig.type}-card`);
        if (element.setConfig) {
          element.setConfig(cardConfig);
        }
      }
      // If the helper was used, we still need to setConfig
      if (element && element.setConfig && !element._config) {
        element.setConfig(cardConfig);
      }
      this._cards.push(element);
    }

    this.requestUpdate();
  }

  // Render a container that holds each card in a wrapper DIV for the FLIP transitions.
  render() {
    return html`
      <div id="flip-container" style="position: relative;">
        ${this._cards
          ? this._cards.map(
              (card, idx) =>
                html`<div class="flip-item flip-index-${idx}"></div>`
            )
          : ""}
      </div>
    `;
  }

  // Once the container is rendered, actually attach the child cards into the DOM.
  updated() {
    const container = this.shadowRoot.getElementById("flip-container");
    if (!container || !this._cards) return;

    // Ensure our observer is watching for child changes.
    this._observer.observe(container, { childList: true, subtree: true });

    // For each placeholder DIV, append the corresponding card.
    const placeholders = container.querySelectorAll(".flip-item");
    placeholders.forEach((placeholder, i) => {
      const card = this._cards[i];
      if (!card || card.parentElement === placeholder) return;
      // Move the card into the placeholder
      placeholder.innerHTML = "";
      placeholder.appendChild(card);
      // Update hass on each card
      if (this._hass) {
        card.hass = this._hass;
      }
    });
  }

  set hass(hass) {
    this._hass = hass;
    if (this._cards) {
      this._cards.forEach((c) => {
        if (!c) return;
        c.hass = hass;
      });
    }
  }

  getCardSize() {
    // A rough guess—adjust as needed or do something more advanced
    return this._cards ? this._cards.length : 1;
  }

  // The FLIP animation logic: measure each card's old and new positions, then animate.
  _flipAnimate() {
    const container = this.shadowRoot.getElementById("flip-container");
    if (!container) return;

    const items = Array.from(container.querySelectorAll(".flip-item"));
    // Capture starting positions
    const firstRects = items.map((item) => item.getBoundingClientRect());
    // Force layout reflow
    void container.offsetWidth;
    // Capture ending positions
    const lastRects = items.map((item) => item.getBoundingClientRect());

    items.forEach((item, index) => {
      const deltaX = firstRects[index].left - lastRects[index].left;
      const deltaY = firstRects[index].top - lastRects[index].top;
      if (deltaX !== 0 || deltaY !== 0) {
        // Instantly move item back to old position
        item.style.transition = "none";
        item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        // Add a small per‐index delay to create a "wave" effect
        const delay = index * 50; // ms
        requestAnimationFrame(() => {
          // Animate to the new position
          item.style.transition = `transform 0.5s ease ${delay}ms`;
          item.style.transform = "";
          // Once transition completes, wobble the item
          const onTransitionEnd = (ev) => {
            if (ev.propertyName !== "transform") return;
            item.removeEventListener("transitionend", onTransitionEnd);
            item.style.animation = "wobble 0.4s ease";
            const onAnimationEnd = () => {
              item.style.animation = "";
              item.removeEventListener("animationend", onAnimationEnd);
            };
            item.addEventListener("animationend", onAnimationEnd);
          };
          item.addEventListener("transitionend", onTransitionEnd);
        });
      }
    });
  }
}

customElements.define("flip-animator-card", FlipAnimatorCard);
