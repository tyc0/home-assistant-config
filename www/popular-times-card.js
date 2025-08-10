class PopularTimesCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this.content) {
      this._updateCard();
    }
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    this.config = config;
    this._createCard();
  }

  _createCard() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }

    this.content = document.createElement('ha-card');
    this.content.classList.add('popularity-card');

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .popularity-card {
        padding: 16px;
        background: var(--card-background-color, #24303A);
        border-radius: 12px;
      }
      .store-name {
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 5px;
        color: var(--primary-text-color, white);
      }
      .store-address {
        font-size: 14px;
        margin-bottom: 15px;
        color: var(--secondary-text-color, #888);
      }
      .graph-container {
        width: 100%;
        height: 200px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .status-container {
        margin-top: 15px;
        display: flex;
        align-items: center;
      }
      .status-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 8px;
      }
      .status-text {
        color: var(--primary-text-color, white);
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `;

    this.storeInfo = document.createElement('div');
    this.storeInfo.classList.add('store-info');

    this.graphContainer = document.createElement('div');
    this.graphContainer.classList.add('graph-container');

    this.statusContainer = document.createElement('div');
    this.statusContainer.classList.add('status-container');

    this.content.appendChild(this.storeInfo);
    this.content.appendChild(this.graphContainer);
    this.content.appendChild(this.statusContainer);

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(this.content);

    this._loadGSAP();
  }

  _loadGSAP() {
    import('/local/gsap/gsap.min.js').then(() => {
      import('/local/gsap/DrawSVGPlugin.min.js').then(() => {
        gsap.registerPlugin(DrawSVGPlugin);
        console.log("GSAP & DrawSVGPlugin loaded.");
        this._updateCard();
      }).catch(() => {
        console.warn("Error loading DrawSVGPlugin. Using fallback.");
      });
    }).catch(() => {
      console.error("Error loading GSAP.");
    });
  }

  _updateCard() {
    if (!this._hass || !this.config.entity) return;

    const entity = this._hass.states[this.config.entity];

    if (!entity) {
      this.storeInfo.innerHTML = `<div class="store-name">Entity not found: ${this.config.entity}</div>`;
      return;
    }

    const storeName = entity.attributes.maps_name || 'Store Location';
    const storeAddress = entity.attributes.address || '';

    this.storeInfo.innerHTML = `
      <div class="store-name">${storeName}</div>
      <div class="store-address">${storeAddress}</div>
    `;

    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    const currentHour = now.getHours();

    const popularityKey = `popularity_${currentDay}`;
    const popularity = entity.attributes[popularityKey];

    if (!popularity || !Array.isArray(popularity)) {
      this.graphContainer.innerHTML = 'No popularity data available';
      return;
    }

    this._createGraph(popularity);
  }

  _createGraph(popularity) {
    this.graphContainer.innerHTML = '';

    if (!window.gsap) {
      this.graphContainer.innerHTML = 'Waiting for animation library...';
      return;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 500 200');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let pathData = "M10 150";

    for (let i = 0; i < popularity.length; i++) {
      const x = i * (500 / popularity.length) + 10;
      const y = 150 - (popularity[i] * 1.5);
      pathData += ` L${x} ${y}`;
    }

    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'transparent');
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '3');
    svg.appendChild(path);
    this.graphContainer.appendChild(svg);

    gsap.fromTo(path,
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 2, ease: "power2.out" }
    );
  }

  getCardSize() {
    return 3;
  }
}

customElements.define('popular-times-card', PopularTimesCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'popular-times-card',
  name: 'Popular Times Card',
  description: 'Displays store popularity data with an animated graph.'
});
