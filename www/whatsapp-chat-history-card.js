class WhatsAppChatHistoryCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) {
      throw new Error("Please define an entity in the card configuration");
    }
    this._config = config;
    this.style.padding = "12px";
  }

  set hass(hass) {
    this._hass = hass;
    this._fetchHistory();
  }

  connectedCallback() {
    // Refresh every 30 seconds (adjust the interval as needed)
    this._interval = setInterval(() => this._fetchHistory(), 30000);
  }

  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
  }

  async _fetchHistory() {
    const entity = this._config.entity;
    const endTime = new Date().toISOString();
    // Look back 24 hours; adjust this window if needed
    const startTime = new Date(Date.now() - 86400000).toISOString();
    const url = `history/period/${startTime}?filter_entity_id=${entity}&end_time=${endTime}`;

    try {
      const data = await this._hass.callApi("GET", url);
      // data is an array per entity; choose the first element (the history array)
      const historyData = (data && data[0]) ? data[0] : [];
      this._renderHistory(historyData);
    } catch (error) {
      console.error("Error fetching chat history:", error);
      this.innerHTML = `<div style="color: var(--error-color)">Error loading chat history.</div>`;
    }
  }

  _renderHistory(historyData) {
    // Use the latest state update from the history array
    let chatLog = "";
    if (historyData.length > 0) {
      // The history API returns data in chronological order; grab the most recent
      chatLog = historyData[historyData.length - 1].state;
    }

    // Style block matching your current chat design
    const styleBlock = `<style>
      @keyframes bounceIn {
        0%   { transform: translateY(20px); opacity: 0; }
        60%  { transform: translateY(-5px); opacity: 1; }
        80%  { transform: translateY(2px); }
        100% { transform: translateY(0); }
      }
      .chat-container {
        max-height: 400px;
        overflow-y: auto;
        scroll-behavior: smooth;
        scrollbar-width: none;
        pointer-events: auto;
        user-select: text;
        display: flex;
        flex-direction: column-reverse;
      }
      .chat-message {
        transition: transform 0.3s ease, margin 0.3s ease;
        margin: 4px;
      }
    </style>`;

    // Build the HTML using your styling rules
    let html = styleBlock + `<div class="chat-container">`;

    // The chat log is a text block with messages separated by newline.
    // We split and reverse it so the newest messages appear at the top.
    const lines = chatLog.split("\n").filter(line => line.trim() !== "").reverse();

    lines.forEach((line, idx) => {
      let timestamp = "";
      let message = line;
      // Expecting a format like "HH:MM - Sender: Message"
      const timestampMatch = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.*)/);
      if (timestampMatch) {
        timestamp = timestampMatch[1];
        message = timestampMatch[2];
      }

      // Determine bubble style: if the message contains "Me:" assume it's sent by you
      const isMe = message.includes("Me:");
      const animationStyle = (idx === 0) ? "animation: bounceIn 0.5s ease-out 0.3s both;" : "";
      const bubbleStyle = `
        background-color: ${isMe ? "var(--purple)" : "var(--pink)"};
        color: #fff;
        padding: 7px 11px;
        border-radius: ${isMe ? "20px 20px 3px 20px" : "20px 20px 20px 3px"};
        max-width: 70%;
        display: flex;
        flex-direction: column;
        ${animationStyle}
      `;
      const timestampHtml = timestamp
        ? `<div style="font-size: 0.7em; opacity: 0.7; margin-top: 2px; ${isMe ? "align-self: flex-end;" : "align-self: flex-start;"}">${timestamp}</div>`
        : "";
      const messageHtml = `<div style="word-wrap: break-word;">${message}</div>`;

      html += `<div class="chat-message" style="display: flex; justify-content: ${isMe ? "flex-end" : "flex-start"};">
        <div style="${bubbleStyle}">
          ${messageHtml}
          ${timestampHtml}
        </div>
      </div>`;
    });

    html += `</div>`;
    this.innerHTML = html;
  }

  getCardSize() {
    // Return a size hint for layout (adjust if necessary)
    return 4;
  }
}

customElements.define("whatsapp-chat-history-card", WhatsAppChatHistoryCard);
