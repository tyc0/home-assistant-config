class MyChatBubbleCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._initialized = false;
    this._lastState = null;
    this._lastInputSelect = null;
    let seenMessages = [];
    try {
      if (window.localStorage) {
        seenMessages = JSON.parse(localStorage.getItem('seenMessages') || '[]');
      }
    } catch (e) {
      console.warn('Could not access or parse localStorage.seenMessages:', e);
    }
    this._seenMessages = new Set(seenMessages);
    this._resizeObserver = new ResizeObserver(() => this._scrollToBottom());
  }

  connectedCallback() {
    requestAnimationFrame(() => {
      const card = this.shadowRoot.querySelector('ha-card');
      if (card) {
        this._resizeObserver.observe(card);
      }
    });
  }

  disconnectedCallback() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }

  static getConfigElement() {
    return null;
  }

  static getStubConfig() {
    return {
      input_select: 'input_select.whatsapp_contacts',
      entity_map: {
        Enhy: 'sensor.chat_history_enhy',
        Dad: 'sensor.chat_history_dad',
        Ben: 'sensor.chat_history_ben',
        Ange: 'sensor.chat_history_ange'
      },
      contact_colors: {
        Enhy: {
          bubbleColor: 'var(--accent-color, var(--primary-color, #1976d2))',
          textColor: 'var(--primary-text-color, var(--text-primary-color, #ffffff))',
          timestampColor: 'var(--secondary-text-color, var(--disabled-text-color, rgba(115,115,115,0.8)))'
        },
        Dad: {
          bubbleColor: 'rgba(224, 145, 50, 0.85)',
          textColor: 'var(--primary-text-color, var(--text-primary-color, #ffffff))',
          timestampColor: 'rgba(224, 145, 50, 0.6)'
        },
        Ben: {
          bubbleColor: 'rgba(210,70,90,0.85)',
          textColor: 'var(--primary-text-color, var(--text-primary-color, #ffffff))',
          timestampColor: 'rgba(210,70,90,0.6)'
        },
        Ange: {
          bubbleColor: 'rgba(100,160,100,0.85)',
          textColor: 'var(--primary-text-color, var(--text-primary-color, #ffffff))',
          timestampColor: 'rgba(100,160,100,0.6)'
        }
      },
      alignment: 'left',
      sentColor: 'var(--primary-background-color, var(--secondary-background-color, #f5f5f5))',
      sentTextColor: 'var(--primary-text-color, var(--text-primary-color, #212121))',
      sentTimestampColor: 'var(--secondary-text-color, var(--disabled-text-color, rgba(115,115,115,0.8)))',
      quotedBackgroundColor: 'var(--divider-color, var(--secondary-background-color, rgba(0,0,0,0.1)))',
      quotedTextColor: 'var(--secondary-text-color, var(--disabled-text-color, #757575))',
      accentColor: 'var(--accent-color, var(--primary-color, #1976d2))'
    };
  }

  setConfig(config) {
    if (!config.input_select) {
      throw new Error('Please define an input_select entity.');
    }
    if (!config.entity_map) {
      throw new Error('Please define entity_map mapping contacts to sensors.');
    }

    this._config = {
      alignment: 'left',
      sentColor: 'var(--primary-background-color, var(--secondary-background-color, #f5f5f5))',
      sentTextColor: 'var(--primary-text-color, var(--text-primary-color, #212121))',
      sentTimestampColor: 'var(--secondary-text-color, var(--disabled-text-color, rgba(115,115,115,0.8)))',
      quotedBackgroundColor: 'var(--divider-color, var(--secondary-background-color, rgba(0,0,0,0.1)))',
      quotedTextColor: 'var(--secondary-text-color, var(--disabled-text-color, #757575))',
      accentColor: 'var(--accent-color, var(--primary-color, #1976d2))',
      contact_colors: {},
      ...config
    };

    this.style.display = 'block';
    this._initialized = false;
  }

  set hass(hass) {
    if (!hass || !this._config?.input_select) return;

    const inputSelectState = hass.states[this._config.input_select];
    if (!inputSelectState) {
      console.warn(`Invalid input select entity: ${this._config.input_select}`);
      return;
    }
    const selectedContact = inputSelectState.state;

    const entityId = this._config.entity_map[selectedContact];
    if (!entityId) {
      console.warn(`No entity mapping for contact: ${selectedContact}`);
      return;
    }

    const stateObj = hass.states[entityId];
    if (!stateObj?.attributes?.chat_content) {
      console.warn(`Invalid state data for ${entityId}`);
      return;
    }

    if (
      !this._initialized ||
      this._lastInputSelect !== selectedContact ||
      this._lastState !== stateObj.state
    ) {
      this._lastState = stateObj.state;
      this._lastInputSelect = selectedContact;
      this._initialized = true;
      this._render(stateObj);
    }
  }

  _render(entityState) {
    try {
      if (!this.shadowRoot) return;

      const rawChat = entityState.attributes.chat_content || '';
      const lines = rawChat
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .slice(-100);

      const messages = lines.map((line) => {
        const match = line.match(
          /^(\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM)?)?)\s+(.*)/i
        );
        const timestamp = match ? match[1] : '';
        const rawMsg = match ? match[2] : line;
        const isMe = rawMsg.includes('Me:');

        let text = rawMsg
          .replace(/^(-?\s*)?Me:\s*/i, '')
          .replace(/^(-?\s*)?[^:]+:\s*/, '')
          .trim();

        let quotedText = null;
        const quotedMatch = rawMsg.match(/\(Quoted:(.*?)\)/);
        if (quotedMatch) {
          quotedText = quotedMatch[1].trim();
          // Remove the (Quoted:...) pattern completely
          text = text.replace(/\(Quoted:.*?\)/, '').trim();

          // Check if text ends with ) and trim it - this handles the common case in your app
          if (text.endsWith(')')) {
            text = text.substring(0, text.length - 1).trim();
          }

          // If after removing the quoted text and parenthesis the message is
          // identical to or a subset of the quoted text, mark it as duplicate
          if (text === quotedText || quotedText.includes(text)) {
            text = '';  // Clear duplicated text
          }
        }

        return { text, timestamp, isMe, quotedText };
      });

      const grouped = this._groupMessages(messages);

      const bubblesHTML = grouped
        .map((group, index) => {
          const isNewest = index === grouped.length - 1;
          const messageId = `${group.isMe}-${group.lines
            .map((l) => l.text)
            .join('-')}`;
          const isNewMessage = isNewest && !this._seenMessages.has(messageId);
          if (isNewMessage) {
            this._seenMessages.add(messageId);
            try {
              if (window.localStorage) {
                localStorage.setItem(
                  'seenMessages',
                  JSON.stringify(Array.from(this._seenMessages))
                );
              }
            } catch (e) {
              console.warn('Could not save seenMessages to localStorage:', e);
            }
          }
          return this._renderGroup(group, isNewMessage);
        })
        .join('');

      this.shadowRoot.innerHTML = `
        <style>
          ha-card {
            mask-image: linear-gradient(to bottom, transparent 4%, var(--ha-card-background, var(--card-background-color, var(--secondary-background-color))) 5%);
            background: var(--ha-card-background, var(--card-background-color, var(--secondary-background-color)));
            padding: 12px;
          }
          .chat-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 400px;
            overflow-y: auto;
            overflow-x: hidden;
            user-select: text;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .chat-container::-webkit-scrollbar {
            display: none;
          }
          .bubble-row {
            display: flex;
            margin: 4px 0;
          }
          .bubble-left {
            animation: slideFromLeft 0.3s ease-out both;
          }
          .bubble-right {
            animation: slideFromRight 0.3s ease-out both;
          }
          @keyframes slideFromLeft {
            0% { opacity: 0; transform: translateX(-20px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          @keyframes slideFromRight {
            0% { opacity: 0; transform: translateX(20px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          .bubble-left .bubble-shape, .bubble-right .bubble-shape {
            padding: 10px 16px;
            box-shadow: none;
            max-width: 70%;
            filter: url('#goo-filter');
            position: relative;
            overflow: hidden;
          }
          .bubble-left .bubble-shape {
            background-color: ${
              this._config.contact_colors[this._lastInputSelect]?.bubbleColor ||
              'var(--accent-color, var(--primary-color, #1976d2))'
            };
            color: ${
              this._config.contact_colors[this._lastInputSelect]?.textColor ||
              'var(--primary-text-color, var(--text-primary-color, #ffffff))'
            };
            margin-right: auto;
            border-radius: 19px 19px 19px 3px;
          }
          .bubble-right .bubble-shape {
            background-color: ${this._config.sentColor || 'var(--primary-background-color, var(--secondary-background-color, #f5f5f5))'};
            color: ${this._config.sentTextColor || 'var(--primary-text-color, var(--text-primary-color, #212121))'};
            margin-left: auto;
            border-radius: 19px 19px 3px 19px;
          }
          .bubble-text {
            font-size: 0.95rem;
            line-height: 1.4;
            word-wrap: break-word;
            position: relative;
            z-index: 2;
          }
          .message-main {
            display: inline-block;
          }
          .timestamp {
            font-size: 0.6em;
            padding-top: 4px;
            opacity: 0.7;
          }
          .bubble-left .timestamp {
            text-align: left;
            color: ${
              this._config.contact_colors[this._lastInputSelect]?.timestampColor ||
              'var(--secondary-text-color, var(--disabled-text-color, rgba(115,115,115,0.8)))'
            };
          }
          .bubble-right .timestamp {
            text-align: right;
            color: ${this._config.sentTimestampColor || 'var(--secondary-text-color, var(--disabled-text-color, rgba(115,115,115,0.8)))'};
          }
          .quoted-message {
            background-color: ${this._config.quotedBackgroundColor || 'var(--divider-color, var(--secondary-background-color, rgba(0,0,0,0.1)))'};
            color: ${this._config.quotedTextColor || 'var(--secondary-text-color, var(--disabled-text-color, #757575))'};
            padding: 8px 12px;
            margin: 6px 0;
            border-left: 3px solid ${this._config.accentColor || 'var(--accent-color, var(--primary-color, #1976d2))'};
            border-radius: 2px 17px 17px 2px;
            box-shadow: inset 0 0 0.5px rgba(0,0,0,0.2);
            line-height: 1.4;
            font-style: oblique;
            font-size: 0.7rem;
            font-weight: 400;
            opacity: 0.75;
          }
          .new-message .bubble-shape {
            border: 2px solid ${this._config.accentColor || 'var(--accent-color, var(--primary-color, #1976d2))'};
            animation: bubble_popup 0.4s 1s both, fadeBorder 3s 1s forwards;
          }
          /* Glass effect styles */
          .glass-effect {
            background: linear-gradient(0deg, transparent, #fff, transparent);
            position: absolute;
            width: 150%;
            height: 150%;
            opacity: 0;
            transform: translate(-200px, -200px) rotate(-45deg);
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1;
          }
          .new-message .glass-effect {
            animation: glass_slide 1.5s 1.4s forwards;
          }
          @keyframes glass_slide {
            0% {
              opacity: 0.2;
              transform: translate(-200px, -200px) rotate(-45deg);
            }
            100% {
              opacity: 0.2;
              transform: translate(200px, 200px) rotate(-45deg);
            }
          }
          @keyframes bubble_popup {
            0%   { transform: scale(.7); opacity: 0; }
            45%  { transform: scale(1.05); opacity: 1; }
            80%  { transform: scale(.95); }
            100% { transform: scale(1); }
          }
          @keyframes fadeBorder {
            0%   { border-color: ${this._config.accentColor || 'var(--accent-color, var(--primary-color, #1976d2))'}; }
            60%  { border-color: ${this._config.accentColor || 'var(--accent-color, var(--primary-color, #1976d2))'}; }
            100% { border-color: transparent; }
          }
        </style>
        <ha-card>
          <svg xmlns="http://www.w3.org/2000/svg" version="1.1" style="position: absolute; width: 0; height: 0;">
            <defs>
              <filter id="goo-filter">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
                <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
              </filter>
            </defs>
          </svg>
          <div class="chat-container" role="log" aria-label="Chat messages">
            ${bubblesHTML ? bubblesHTML : '<p>No chat content available</p>'}
          </div>
        </ha-card>
      `;

      requestAnimationFrame(() => {
        this._scrollToBottom();
        this._animateNewMessages();
      });
    } catch (err) {
      console.error('Error rendering my-chat-bubble-card:', err);
      this.shadowRoot.innerHTML = `<hui-warning>Error: ${err.message}</hui-warning>`;
    }
  }

  _scrollToBottom() {
    const container = this.shadowRoot?.querySelector('.chat-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  _groupMessages(messages) {
    const grouped = [];
    let currentGroup = null;
    for (const msg of messages) {
      if (!currentGroup || currentGroup.isMe !== msg.isMe) {
        currentGroup = { isMe: msg.isMe, lines: [] };
        grouped.push(currentGroup);
      }
      currentGroup.lines.push(msg);
    }
    return grouped;
  }

  _renderGroup(group, isNewest) {
    const bubbleAlign = group.isMe ? 'bubble-right' : 'bubble-left';
    const lastLine = group.lines[group.lines.length - 1];

    const allText = group.lines
      .map((l) => {
        if (l.quotedText && l.text.length === 0) {
          return `<div class="quoted-message">${this._escapeHTML(l.quotedText)}</div>`;
        } else if (l.quotedText) {
          return `<div class="quoted-message">${this._escapeHTML(l.quotedText)}</div>${this._escapeHTML(l.text)}`;
        } else {
          // No quoted text, just show the message
          return this._escapeHTML(l.text);
        }
      })
      .join('<br>');

    const stamp = this._escapeHTML(lastLine.timestamp);
    const animationClass = isNewest ? 'new-message' : '';

    return `
      <div class="bubble-row ${bubbleAlign} ${animationClass}" role="listitem" aria-label="${
      group.isMe ? 'Sent' : 'Received'
    } messages">
        <div class="bubble-shape">
          <div class="glass-effect"></div>
          <div class="bubble-text">
            <span class="message-main">
              ${allText}
            </span>
            <div class="timestamp" aria-label="Sent at ${stamp}">
              ${stamp}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _animateNewMessages() {
    if (typeof gsap === 'undefined') {
      console.warn('GSAP not found. Advanced animations will not run.');
      return;;
    }
    const newMessageElements = this.shadowRoot.querySelectorAll(
      '.new-message .message-main'
    );
    newMessageElements.forEach((element) => {
      if (element.getAttribute('data-animated')) return;
      const text = element.textContent;
      element.innerHTML = '';
      text.split('').forEach((letter) => {
        const span = document.createElement('span');
        span.textContent = letter;
        element.appendChild(span);
      });
      gsap.fromTo(
        element.querySelectorAll('span'),
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.05,
          ease: 'back.out(1.7)'
        }
      );
      element.setAttribute('data-animated', 'true');;
    });
  }

  _escapeHTML(str) {
    if (!str || typeof str !== 'string') return '';

    return str
      .replace(/&/g, '&amp;')    // Must come first to avoid double-escaping
      .replace(/'/g, '&#39;')    // Handle all regular single quotes
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\\'/g, '&#39;'); // Handle any remaining escaped single quotes
  }

  getCardSize() {
    return 8;
  }
}

customElements.define('my-chat-bubble-card', MyChatBubbleCard);
