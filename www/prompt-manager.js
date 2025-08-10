// Custom Prompt Manager Card for Home Assistant
// JavaScript version with modern patterns



class PromptManagerCard extends HTMLElement {
  state;
  shadow;
  config;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.config = {};
    this.state = {
      prompts: [],
      searchTerm: '',
      selectedTags: [],
      showAddForm: false,
      editingPrompt: null,
      expandedPrompts: new Set(),
      showTagManager: false,
      visibleCount: 50
    };
    // Track pending backend syncs for offline resilience
    this._pendingBackendSync = false;
    // Track auto-hide timers for description popovers per prompt id
    this._descriptionTimers = new Map();
  }

  setConfig(config) {
    this.config = config;
    this.loadPrompts();
    this.render();
    this.setupEventListeners();
  }

  set hass(hass) {
    // Called when Home Assistant state changes
    // You can access hass.states here if needed
    if (!this._hass) {
      this._hass = hass;
      this.fetchPromptsFromBackend();
    } else {
      this._hass = hass;
      // If we previously failed to sync, try again when HA updates (likely online)
      if (this._pendingBackendSync && this._hass?.connection) {
        this.attemptBackendSyncIfPending();
      }
    }
  }

  loadPrompts() {
    try {
      const stored = localStorage.getItem('ai_prompts');
      this.state.prompts = stored ? JSON.parse(stored) : this.getDefaultPrompts();
    } catch (error) {
      console.warn('Could not load prompts from localStorage:', error);
      this.state.prompts = [];
    }
  }

  getDefaultPrompts() {
    return [
      {
        id: 1,
        title: 'DET Meeting Minutes',
        content: 'Generate definitive minutes for the Digital Executive Team (DET) meeting, intended as the authoritative record for the Digital Group within the Department for Work and Pensions. Using the provided transcript and accompanying documents as your primary sources, craft a polished narrative that serves both as an immediate record and an enduring reference for strategic decisions.\n\nStructure and Narrative Flow\n• Follow the agenda items sequentially as provided in the meeting documentation.\n• For each agenda item, maintain its exact title as a heading.\n• Develop a seamless narrative within each agenda item that captures the essence of discussions without simply transcribing conversation fragments.',
        tags: ['work', 'writing'],
        lastUsed: new Date('2024-01-15'),
        useCount: 23,
        created: new Date('2024-01-10')
      },
      {
        id: 2,
        title: 'Home Assistant Dashboard Component',
        content: 'Create a Home Assistant Lovelace custom card component that follows zero-UI design principles. The component should:\n\n1. Use minimal visual elements - no unnecessary borders, shadows, or decorative elements\n2. Display information directly without explanatory text\n3. Implement sophisticated functionality beneath a clean interface\n4. Use functional color coding rather than aesthetic choices\n5. Include error handling and graceful degradation\n\nThe card should be built as a custom element with Shadow DOM encapsulation.',
        tags: ['home-assistant', 'coding'],
        lastUsed: new Date('2024-01-14'),
        useCount: 12,
        created: new Date('2024-01-05')
      },
      {
        id: 3,
        title: 'MPV Lua Script Generator',
        content: 'Write a Lua script for MPV that enhances video playback functionality. The script should:\n\n• Be efficient and follow MPV scripting best practices\n• Include proper error handling and logging\n• Use minimal system resources\n• Provide useful keyboard shortcuts\n• Work across different video formats\n\nEnsure the script integrates seamlessly with existing MPV configuration.',
        tags: ['lua', 'coding'],
        lastUsed: new Date('2024-01-13'),
        useCount: 8,
        created: new Date('2024-01-08')
      }
    ];
  }

  savePrompts() {
    try {
      localStorage.setItem('ai_prompts', JSON.stringify(this.state.prompts));
    } catch (error) {
      console.warn('Could not save prompts to localStorage:', error);
    }
    this.savePromptsToBackend();
  }

  detectTags(content) {
    const tags = [];
    const lower = content.toLowerCase();

    const tagPatterns = {
      'coding': ['code', 'programming', 'javascript', 'python', 'typescript', 'html', 'css'],
      'writing': ['write', 'email', 'letter', 'document', 'report'],
      'analysis': ['analyze', 'data', 'research', 'study', 'examine'],
      'creative': ['creative', 'story', 'poem', 'art', 'design'],
      'work': ['meeting', 'minutes', 'agenda', 'business', 'professional'],
      'home-assistant': ['home assistant', 'automation', 'script', 'lovelace'],
      'lua': ['lua', 'mpv'],
      'userscripts': ['userscript', 'browser', 'tampermonkey', 'greasemonkey']
    };

    Object.entries(tagPatterns).forEach(([tag, patterns]) => {
      if (patterns.some(pattern => lower.includes(pattern))) {
        tags.push(tag);
      }
    });

    return tags;
  }

  // Backend persistence (Home Assistant websocket)
  async fetchPromptsFromBackend() {
    try {
      if (!this._hass || !this._hass.connection) return;
      const resp = await this._hass.connection.sendMessagePromise({
        type: 'prompt_manager/get_prompts'
      });
      if (resp && Array.isArray(resp.prompts)) {
        const backendPrompts = resp.prompts.map(p => ({
          ...p,
          lastUsed: p.lastUsed ? new Date(p.lastUsed) : new Date(),
          created: p.created ? new Date(p.created) : new Date(),
        }));

        // If backend is empty but we have local prompts, push local to backend
        let localPrompts = [];
        try {
          const stored = localStorage.getItem('ai_prompts');
          localPrompts = stored ? JSON.parse(stored) : [];
        } catch { /* ignore */ }

        if ((backendPrompts?.length || 0) === 0 && (localPrompts?.length || 0) > 0) {
          // Prefer restoring from local fallback after restart or first-time setup
          this.state.prompts = localPrompts.map(p => ({
            ...p,
            lastUsed: p.lastUsed ? new Date(p.lastUsed) : new Date(),
            created: p.created ? new Date(p.created) : new Date(),
          }));
          // Attempt to persist to backend
          await this.savePromptsToBackend();
        } else {
          this.state.prompts = backendPrompts;
        }

        // Sync into localStorage for offline fallback
        try { localStorage.setItem('ai_prompts', JSON.stringify(this.state.prompts)); } catch {}
        this.render();

        // If we had unsynced data queued locally, try to push now
        if (this._pendingBackendSync) {
          this.attemptBackendSyncIfPending();
        }
      }
    } catch (err) {
      console.warn('Prompt Manager: backend fetch failed, using localStorage fallback', err);
    }
  }

  async savePromptsToBackend() {
    try {
      if (!this._hass || !this._hass.connection) return;
      const serializable = this.state.prompts.map(p => ({
        ...p,
        lastUsed: p.lastUsed ? new Date(p.lastUsed).toISOString() : null,
        created: p.created ? new Date(p.created).toISOString() : null,
      }));
      await this._hass.connection.sendMessagePromise({
        type: 'prompt_manager/set_prompts',
        prompts: serializable,
      });
      // If successful, clear any pending sync flag and cache
      this._pendingBackendSync = false;
      try { localStorage.removeItem('ai_prompts_unsynced'); } catch {}
    } catch (err) {
      console.warn('Prompt Manager: backend save failed (will persist locally)', err);
      // Mark for retry and cache unsynced payload
      this._pendingBackendSync = true;
      try {
        const serializable = this.state.prompts.map(p => ({
          ...p,
          lastUsed: p.lastUsed ? new Date(p.lastUsed).toISOString() : null,
          created: p.created ? new Date(p.created).toISOString() : null,
        }));
        localStorage.setItem('ai_prompts_unsynced', JSON.stringify(serializable));
      } catch { /* ignore */ }
    }
  }

  async attemptBackendSyncIfPending() {
    if (!this._pendingBackendSync || !this._hass?.connection) return;
    // Prefer explicitly saved unsynced payload if present
    let toSync = null;
    try {
      const raw = localStorage.getItem('ai_prompts_unsynced');
      toSync = raw ? JSON.parse(raw) : null;
    } catch { /* ignore */ }

    const serializable = Array.isArray(toSync)
      ? toSync
      : this.state.prompts.map(p => ({
          ...p,
          lastUsed: p.lastUsed ? new Date(p.lastUsed).toISOString() : null,
          created: p.created ? new Date(p.created).toISOString() : null,
        }));

    try {
      await this._hass.connection.sendMessagePromise({
        type: 'prompt_manager/set_prompts',
        prompts: serializable,
      });
      this._pendingBackendSync = false;
      try { localStorage.removeItem('ai_prompts_unsynced'); } catch {}
    } catch (e) {
      // Keep pending; will retry later
      console.warn('Prompt Manager: retry sync failed', e);
    }
  }

  addPrompt(title, content, tags, description) {
    const newPrompt = {
      id: Date.now(),
      title: title || 'Untitled Prompt',
      content,
      tags: (Array.isArray(tags) && tags.length > 0) ? tags : this.detectTags(content),
      description: description || '',
      lastUsed: new Date(),
      useCount: 0,
      created: new Date()
    };
    this.state.prompts.unshift(newPrompt);
    this.savePrompts();
    this.state.showAddForm = false;
    this.render();
  }

  updatePrompt(id, updates) {
    this.state.prompts = this.state.prompts.map(p =>
      p.id === id
        ? {
            ...p,
            ...updates,
            tags: updates.tags !== undefined
              ? (Array.isArray(updates.tags) && updates.tags.length > 0 ? updates.tags : [])
              : p.tags
          }
        : p
    );
    this.savePrompts();
    this.state.editingPrompt = null;
    this.render();
  }

  deletePrompt(id) {
    this.state.prompts = this.state.prompts.filter(p => p.id !== id);
    this.savePrompts();
    this.render();
  }

  async copyPrompt(prompt) {
    const performVisualFeedback = () => {
      const button = this.shadow.querySelector(`[data-copy-id="${prompt.id}"]`);
      if (!button) return;

      // Prepare helpers
      const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a 2 2 0 0 1-2-2V4a 2 2 0 0 1 2-2h9a 2 2 0 0 1 2 2v1"></path></svg>';
      const tickIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"></polyline></svg>';
      const originalAria = button.getAttribute('aria-label') || 'Copy prompt content';

      // Show success state
      button.classList.add('copied');
      button.setAttribute('aria-label', 'Done');
      button.innerHTML = tickIcon;

      // Ensure we revert even if DOM re-rendered
      if (!this._copyTimers) this._copyTimers = new Map();
      const existing = this._copyTimers.get(prompt.id);
      if (existing) clearTimeout(existing);
      const timeoutId = setTimeout(() => {
        const btn = this.shadow.querySelector(`[data-copy-id="${prompt.id}"]`);
        if (btn) {
          btn.classList.remove('copied');
          btn.innerHTML = copyIcon;
          btn.setAttribute('aria-label', originalAria);
        }
        this._copyTimers.delete(prompt.id);
      }, 3000);
      this._copyTimers.set(prompt.id, timeoutId);
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(prompt.content);
      } else {
        // Fallback for environments without Clipboard API
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = prompt.content;
        tempTextArea.style.position = 'fixed';
        tempTextArea.style.opacity = '0';
        document.body.appendChild(tempTextArea);
        tempTextArea.focus();
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
      }

      // Update usage stats
      this.state.prompts = this.state.prompts.map(p =>
        p.id === prompt.id
          ? { ...p, lastUsed: new Date(), useCount: p.useCount + 1 }
          : p
      );
      this.savePrompts();

      // Visual feedback
      performVisualFeedback();
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  getFilteredPrompts() {
    return this.state.prompts
      .filter(prompt => {
        const matchesSearch = !this.state.searchTerm ||
          prompt.title.toLowerCase().includes(this.state.searchTerm.toLowerCase()) ||
          prompt.content.toLowerCase().includes(this.state.searchTerm.toLowerCase()) ||
          prompt.tags.some(tag => tag.toLowerCase().includes(this.state.searchTerm.toLowerCase()));

        const matchesTags = this.state.selectedTags.length === 0 ||
          this.state.selectedTags.every(tag => prompt.tags.includes(tag));

        return matchesSearch && matchesTags;
      })
      .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
  }

  getAllTags() {
    const allTags = [];
    this.state.prompts.forEach(p => {
      p.tags.forEach(tag => {
        if (!allTags.includes(tag)) {
          allTags.push(tag);
        }
      });
    });
    return allTags;
  }

  handleAddClick = () => {
    this.state.showAddForm = true;
    this.render();
  };

  handleManageTagsClick = () => {
    this.state.showTagManager = true;
    this.render();
  };

  handleSearchInput = (e) => {
    const target = e.target;
    this.state.searchTerm = target.value;
    this.updateClearButtonVisibility();
    this.debounceSearch();
  };

  debounceSearch = (() => {
    let timer = null;
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        this.updatePromptsGrid();
      }, 150);
    };
  })();

  handleSearchKeyDown = (e) => {
    // Prevent HA global shortcuts from triggering while typing
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Tab') {
      const input = e.currentTarget;
      if (input && input.blur) input.blur();
    }
  };

  handleSearchKeyUp = (e) => {
    // Extra guard against HA shortcuts
    e.stopPropagation();
  };

  handleSearchClear = () => {
    this.state.searchTerm = '';
    const input = this.shadow.getElementById('search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    this.updateClearButtonVisibility();
    this.updatePromptsGrid();
  };

  updateClearButtonVisibility() {
    const clearBtn = this.shadow.getElementById('clear-search');
    if (clearBtn) {
      clearBtn.style.display = this.state.searchTerm ? 'inline-flex' : 'none';
    }
  }

  updatePromptsGrid() {
    const content = this.shadow.querySelector('.content');
    if (!content) return;
    const filteredPrompts = this.getFilteredPrompts();
    const slice = filteredPrompts.slice(0, this.state.visibleCount);
    // Only update the grid area to avoid full re-render
    const gridWrapper = content.querySelector('.prompts-grid') || null;
    const emptyState = content.querySelector('.empty-state') || null;
    if (slice.length === 0) {
      if (gridWrapper) gridWrapper.remove();
      if (!emptyState) {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.textContent = this.state.searchTerm || this.state.selectedTags.length > 0
          ? 'No prompts match your filters'
          : 'No prompts yet. Add your first one above.';
        content.appendChild(div);
      } else {
        emptyState.textContent = this.state.searchTerm || this.state.selectedTags.length > 0
          ? 'No prompts match your filters'
          : 'No prompts yet. Add your first one above.';
      }
      return;
    }
    // Ensure grid exists
    if (!gridWrapper) {
      if (emptyState) emptyState.remove();
      const grid = document.createElement('div');
      grid.className = 'prompts-grid';
      grid.id = 'prompts-grid';
      grid.innerHTML = slice.map(p => this.renderPromptCard(p)).join('');
      content.appendChild(grid);
      this.setupContentEventListeners();
      return;
    }
    // Diff update: replace innerHTML wholesale for now (fast path), delegation prevents leaks
    gridWrapper.innerHTML = slice.map(p => this.renderPromptCard(p)).join('');
  }

  setupContentEventListeners() {
    const grid = this.shadow.getElementById('prompts-grid');
    if (!grid) return;
    // Use event delegation to avoid per-item listeners
    grid.addEventListener('click', (e) => {
      const selector = '[data-copy-id], [data-dropdown], [data-edit], [data-delete], [data-expand], [data-info-id]';
      // Safely resolve the nearest actionable element even if the original click was on a text node or SVG child
      let target = null;
      if (typeof e.composedPath === 'function') {
        for (const node of e.composedPath()) {
          if (node && node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(selector)) {
            target = node;
            break;
          }
        }
      }
      if (!target) {
        let el = e.target;
        if (!el || el.nodeType !== Node.ELEMENT_NODE) {
          el = el?.parentElement || null;
        }
        target = el && el.closest ? el.closest(selector) : null;
      }
      if (!target) return;
      if (target.dataset.copyId) {
        const promptId = parseInt(target.dataset.copyId || '0');
        const prompt = this.state.prompts.find(p => p.id === promptId);
        if (prompt) this.handleCopyClick(prompt);
        return;
      }
      if (target.dataset.infoId) {
        e.stopPropagation();
        const pid = parseInt(target.dataset.infoId || '0');
        this.toggleDescriptionPopover(pid);
        return;
      }
      if (target.dataset.dropdown) {
        e.stopPropagation();
        const dropdownId = parseInt(target.dataset.dropdown || '0');
        this.handleDropdownClick(e, dropdownId);
        return;
      }
      if (target.dataset.edit) {
        this.handleEditClick(parseInt(target.dataset.edit || '0'));
        return;
      }
      if (target.dataset.delete) {
        this.handleDeleteClick(parseInt(target.dataset.delete || '0'));
        return;
      }
      if (target.dataset.expand) {
        this.handleExpandClick(parseInt(target.dataset.expand || '0'));
        return;
      }
    }, { passive: true });

    // Improve reliability: ensure clicks on inner SVGs trigger buttons
    grid.querySelectorAll('.dropdown-button svg, .copy-button svg, .show-more-button svg').forEach(svg => {
      svg.style.pointerEvents = 'none';
    });

    // Hover/touch show + inactivity auto-hide for descriptions via delegation
    grid.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('[data-info-id]');
      if (!btn) return;
      const pid = parseInt(btn.dataset.infoId || '0');
      this.showDescriptionPopover(pid);
    });
    grid.addEventListener('mouseout', (e) => {
      const related = e.relatedTarget;
      const btn = e.target.closest('[data-info-id]');
      if (!btn) return;
      const pid = parseInt(btn.dataset.infoId || '0');
      // Start a short delay before hide to allow moving into the popover
      this.startDescriptionHideTimer(pid, 800);
    });
    grid.addEventListener('mousemove', (e) => {
      const pop = e.target.closest('.description-popover');
      if (!pop) return;
      const pid = parseInt(pop.getAttribute('data-popover-for') || '0');
      this.resetDescriptionInactivity(pid);
    });
    grid.addEventListener('mouseleave', () => {
      // When cursor leaves the grid, hide all open popovers after a short delay
      this.hideAllDescriptions(500);
    });
  }

  handleTagClick = (tag) => {
    if (this.state.selectedTags.includes(tag)) {
      this.state.selectedTags = this.state.selectedTags.filter(t => t !== tag);
    } else {
      this.state.selectedTags.push(tag);
    }
    this.render();
  };

  handleDropdownClick = (e, promptId) => {
    e.stopPropagation();
    const menu = this.shadow.querySelector(`[data-dropdown-menu="${promptId}"]`);

    // Close all other dropdowns
    this.shadow.querySelectorAll('.dropdown-menu').forEach(m => {
      if (m !== menu) m.classList.remove('open');
    });

    // Toggle this dropdown
    if (menu) menu.classList.toggle('open');
  };

  handleCopyClick = (prompt) => {
    this.copyPrompt(prompt);
  };

  handleEditClick = (promptId) => {
    this.state.editingPrompt = promptId;
    this.render();
  };

  handleDeleteClick = (promptId) => {
    this.deletePrompt(promptId);
  };

  handleExpandClick = (promptId) => {
    const isCurrentlyExpanded = this.state.expandedPrompts.has(promptId);
    if (isCurrentlyExpanded) {
      this.state.expandedPrompts.delete(promptId);
    } else {
      this.state.expandedPrompts.add(promptId);
    }

    // Try to update the specific card inline without a full re-render for better UX
    const button = this.shadow.querySelector(`.show-more-button[data-expand="${promptId}"]`);
    const prompt = this.state.prompts.find(p => p.id === promptId);
    if (button && prompt) {
      const cardContent = button.closest('.card-content');
      const pre = cardContent ? cardContent.querySelector('pre') : null;
      const nowExpanded = !isCurrentlyExpanded;
      button.setAttribute('aria-expanded', String(nowExpanded));
      button.textContent = nowExpanded ? 'Show less' : 'Show more';
      if (pre) {
        const truncated = prompt.content.length > 200 ? `${prompt.content.substring(0, 200)}...` : prompt.content;
        pre.textContent = nowExpanded ? prompt.content : truncated;
      }
      return;
    }

    // Fallback: if we cannot find the elements, do a full render
    this.render();
  };

  // Description popover logic
  showDescriptionPopover(promptId) {
    const pop = this.shadow.querySelector(`.description-popover[data-popover-for="${promptId}"]`);
    const btn = this.shadow.querySelector(`.info-button[data-info-id="${promptId}"]`);
    if (!pop || !btn) return;
    pop.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    this.resetDescriptionInactivity(promptId);
  }

  hideDescriptionPopover(promptId) {
    const pop = this.shadow.querySelector(`.description-popover[data-popover-for="${promptId}"]`);
    const btn = this.shadow.querySelector(`.info-button[data-info-id="${promptId}"]`);
    if (!pop || !btn) return;
    pop.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    const t = this._descriptionTimers.get(promptId);
    if (t) clearTimeout(t);
    this._descriptionTimers.delete(promptId);
  }

  toggleDescriptionPopover(promptId) {
    const pop = this.shadow.querySelector(`.description-popover[data-popover-for="${promptId}"]`);
    if (!pop) return;
    if (pop.classList.contains('open')) {
      this.hideDescriptionPopover(promptId);
    } else {
      this.showDescriptionPopover(promptId);
    }
  }

  startDescriptionHideTimer(promptId, delayMs = 2000) {
    const prev = this._descriptionTimers.get(promptId);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(() => this.hideDescriptionPopover(promptId), delayMs);
    this._descriptionTimers.set(promptId, handle);
  }

  resetDescriptionInactivity(promptId) {
    // Auto-hide after 4s of inactivity while open
    this.startDescriptionHideTimer(promptId, 4000);
  }

  hideAllDescriptions(delayMs = 0) {
    if (delayMs <= 0) {
      this.shadow.querySelectorAll('.description-popover.open').forEach(p => {
        const pid = parseInt(p.getAttribute('data-popover-for') || '0');
        this.hideDescriptionPopover(pid);
      });
      return;
    }
    // Schedule hides with same delay
    this.shadow.querySelectorAll('.description-popover.open').forEach(p => {
      const pid = parseInt(p.getAttribute('data-popover-for') || '0');
      this.startDescriptionHideTimer(pid, delayMs);
    });
  }

  handleFormSubmit = (isEdit) => {
    const titleInput = this.shadow.getElementById(isEdit ? 'edit-title' : 'add-title');
    const contentInput = this.shadow.getElementById(isEdit ? 'edit-content' : 'add-content');
    const chipInput = this.shadow.getElementById(isEdit ? 'edit-chip-input' : 'add-chip-input');
    const descInput = this.shadow.getElementById(isEdit ? 'edit-description' : 'add-description');

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const description = (descInput?.value || '').trim();
    const formType = isEdit ? 'edit' : 'add';
    const pending = (chipInput?.value || '').trim();
    const tags = this.getChips(formType);
    if (pending) tags.push(pending);

    if (!title || !content || tags.length === 0) return;

    if (isEdit && this.state.editingPrompt) {
      this.updatePrompt(this.state.editingPrompt, { title, content, tags, description });
    } else {
      this.addPrompt(title, content, tags, description);
    }
  };

  handleFormCancel = () => {
    this.state.showAddForm = false;
    this.state.editingPrompt = null;
    this.state.showTagManager = false;
    this.render();
  };

  // Chip helpers
  getChips(formType) {
    const chipsContainer = this.shadow.getElementById(formType === 'edit' ? 'edit-chips' : 'add-chips');
    if (!chipsContainer) return [];
    return Array.from(chipsContainer.querySelectorAll('.chip'))
      .map(chip => chip.dataset.tag || '')
      .filter(Boolean);
  }

  addChip(formType, tag) {
    const normalized = tag.trim();
    if (!normalized) return;
    const chips = this.getChips(formType);
    if (chips.includes(normalized)) return;
    const chipsContainer = this.shadow.getElementById(formType === 'edit' ? 'edit-chips' : 'add-chips');
    if (!chipsContainer) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.tag = normalized;
    chip.innerHTML = `
      <span class="chip-text">${this.escapeHtml(normalized)}</span>
      <button type="button" class="chip-remove" aria-label="Remove tag" data-form="${formType}" data-tag="${this.escapeHtml(normalized)}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    chipsContainer.appendChild(chip);
    // Bind remove handler for the new chip
    const removeBtn = chip.querySelector('.chip-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => this.removeChip(formType, normalized));
    }
  }

  removeChip(formType, tag) {
    const chipsContainer = this.shadow.getElementById(formType === 'edit' ? 'edit-chips' : 'add-chips');
    if (!chipsContainer) return;
    const chip = Array.from(chipsContainer.querySelectorAll('.chip'))
      .find(c => (c.dataset.tag || '') === tag);
    if (chip) chipsContainer.removeChild(chip);
  }

  deleteTagGlobally(tag) {
    const normalized = (tag || '').trim();
    if (!normalized) return;
    this.state.prompts = this.state.prompts.map(p => ({
      ...p,
      tags: (p.tags || []).filter(t => t !== normalized)
    }));
    this.savePrompts();
    // Keep the manager open and re-render to reflect updated usage
    this.render();
    this.state.showTagManager = true;
    this.setupEventListeners();
  }

  updateFormValidity(formType) {
    const isEdit = formType === 'edit';
    const title = this.shadow.getElementById(isEdit ? 'edit-title' : 'add-title');
    const content = this.shadow.getElementById(isEdit ? 'edit-content' : 'add-content');
    const chipInput = this.shadow.getElementById(isEdit ? 'edit-chip-input' : 'add-chip-input');
    const submit = this.shadow.getElementById(isEdit ? 'edit-submit' : 'add-submit');
    if (!submit) return;
    const chips = this.getChips(formType);
    const pending = (chipInput?.value || '').trim();
    const isValid = Boolean(title?.value.trim()) && Boolean(content?.value.trim()) && (chips.length > 0 || Boolean(pending));
    submit.disabled = !isValid;
  }

  handleOutsideClick = (e) => {
    const target = e.target;
    if (!target.closest('.dropdown-container')) {
      this.shadow.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.remove('open');
      });
    }
    if (!target.closest('.info-container')) {
      // Close any open description popovers when clicking outside
      this.hideAllDescriptions(0);
    }
  };

  renderPromptCard(prompt) {
    const isExpanded = this.state.expandedPrompts.has(prompt.id);
    const truncatedContent = prompt.content.length > 200
      ? prompt.content.substring(0, 200) + '...'
      : prompt.content;

    return `
      <div class="prompt-card" role="article">
        <div class="card-header">
          <h3 class="card-title">${this.escapeHtml(prompt.title)}</h3>
          <div class="card-actions">
            ${prompt.description ? `
            <div class="info-container">
              <button class="info-button" data-info-id="${prompt.id}" aria-haspopup="true" aria-expanded="false" aria-label="Show description">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M2 4h20v2H2zM7 8h10a4 4 0 0 1 0 8H7z"></path>
                  <circle cx="7" cy="12" r="2"></circle>
                </svg>
              </button>
              <div class="description-popover" role="dialog" data-popover-for="${prompt.id}">
                <div class="description-content">${this.escapeHtml(prompt.description)}</div>
              </div>
            </div>
            ` : ''}
            <button class="copy-button" data-copy-id="${prompt.id}" aria-label="Copy prompt content" title="Copy">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a 2 2 0 0 1-2-2V4a 2 2 0 0 1 2-2h9a 2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <div class="dropdown-container">
              <button class="dropdown-button" data-dropdown="${prompt.id}" aria-label="More options" aria-haspopup="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
              <div class="dropdown-menu" data-dropdown-menu="${prompt.id}" role="menu">
                <button class="dropdown-item" data-edit="${prompt.id}" role="menuitem">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  Edit
                </button>
                <button class="dropdown-item danger" data-delete="${prompt.id}" role="menuitem">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"></polyline>
                    <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="card-content">
          <pre>${this.escapeHtml(isExpanded ? prompt.content : truncatedContent)}</pre>
          ${prompt.content.length > 200 ? `
            <button class="show-more-button" data-expand="${prompt.id}" aria-expanded="${isExpanded}" aria-label="${isExpanded ? 'Show less' : 'Show more'}">
              ${isExpanded ? 'Show less' : 'Show more'}
            </button>
          ` : ''}
        </div>

        <div class="card-tags" role="group" aria-label="Tags">
          ${prompt.tags.map(tag => `<span class="card-tag" ${this.getTagStyle(tag)}>${this.escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  renderAddForm() {
    const allTags = this.getAllTags();
    return `
      <div class="modal-overlay" role="dialog" aria-labelledby="add-prompt-title">
        <div class="modal">
          <h2 id="add-prompt-title">Add Prompt</h2>
          <input
            type="text"
            placeholder="Prompt title"
            class="form-input"
            id="add-title"
            aria-label="Prompt title"
            required
          />
          <textarea
            placeholder="Description (optional)"
            class="form-textarea"
            id="add-description"
            aria-label="Prompt description"
            style="min-height: 80px;"
          ></textarea>
          <div class="tags-editor" data-form="add">
            <div class="chips" id="add-chips"></div>
            <input
              type="text"
              class="chip-input"
              id="add-chip-input"
              placeholder="Add tag..."
              aria-label="Add tag"
            />
            <div class="tag-suggestions" id="add-tags-suggestions" role="listbox" aria-label="Tag suggestions">
              ${allTags.map(tag => `
                <button type="button" class="tag-suggestion" data-form="add" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</button>
              `).join('')}
            </div>
          </div>
          <textarea
            placeholder="Paste your prompt here..."
            class="form-textarea"
            id="add-content"
            aria-label="Prompt content"
            required
          ></textarea>
          <div class="form-buttons">
            <button class="form-button" id="add-cancel">Cancel</button>
            <button class="form-button primary" id="add-submit" disabled>Add Prompt</button>
          </div>
        </div>
      </div>
    `;
  }

  renderEditForm() {
    const prompt = this.state.prompts.find(p => p.id === this.state.editingPrompt);
    if (!prompt) return '';

    const allTags = this.getAllTags();
    return `
      <div class="modal-overlay" role="dialog" aria-labelledby="edit-prompt-title">
        <div class="modal">
          <h2 id="edit-prompt-title">Edit Prompt</h2>
          <input
            type="text"
            placeholder="Prompt title"
            class="form-input"
            id="edit-title"
            value="${this.escapeHtml(prompt.title)}"
            aria-label="Prompt title"
            required
          />
          <textarea
            placeholder="Description (optional)"
            class="form-textarea"
            id="edit-description"
            aria-label="Prompt description"
            style="min-height: 80px;"
          >${this.escapeHtml(prompt.description || '')}</textarea>
          <div class="tags-editor" data-form="edit">
            <div class="chips" id="edit-chips">
              ${(prompt.tags || []).map(tag => `
                <span class="chip" data-tag="${this.escapeHtml(tag)}">
                  <span class="chip-text">${this.escapeHtml(tag)}</span>
                  <button type="button" class="chip-remove" aria-label="Remove tag" data-form="edit" data-tag="${this.escapeHtml(tag)}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </span>
              `).join('')}
            </div>
            <input
              type="text"
              class="chip-input"
              id="edit-chip-input"
              placeholder="Add tag..."
              aria-label="Add tag"
            />
            <div class="tag-suggestions" id="edit-tags-suggestions" role="listbox" aria-label="Tag suggestions">
              ${allTags.map(tag => `
                <button type="button" class="tag-suggestion" data-form="edit" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</button>
              `).join('')}
            </div>
          </div>
          <textarea
            class="form-textarea"
            id="edit-content"
            aria-label="Prompt content"
            required
          >${this.escapeHtml(prompt.content)}</textarea>
          <div class="form-buttons">
            <button class="form-button" id="edit-cancel">Cancel</button>
            <button class="form-button primary" id="edit-submit" disabled>Update</button>
          </div>
        </div>
      </div>
    `;
  }

  renderTagManager() {
    const tagUsage = new Map();
    this.state.prompts.forEach(p => (p.tags || []).forEach(t => tagUsage.set(t, (tagUsage.get(t) || 0) + 1)));
    const allTags = Array.from(tagUsage.keys()).sort((a, b) => a.localeCompare(b));
    return `
      <div class="modal-overlay" role="dialog" aria-labelledby="manage-tags-title">
        <div class="modal">
          <h2 id="manage-tags-title">Manage Tags</h2>
          <div class="tags-list" id="tags-list">
            ${allTags.length === 0 ? '<div class="empty-state">No tags yet.</div>' : allTags.map(tag => `
              <div class="tag-row">
                <span class="tag-name">${this.escapeHtml(tag)}</span>
                <span class="tag-count">${tagUsage.get(tag)} usages</span>
                <button class="form-button danger" data-delete-tag="${this.escapeHtml(tag)}">Delete</button>
              </div>
            `).join('')}
          </div>
          <div class="form-buttons">
            <button class="form-button" id="manage-cancel">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  setupEventListeners() {
    // Add button
    const addButton = this.shadow.getElementById('add-button');
    if (addButton) {
      addButton.addEventListener('click', this.handleAddClick);
    }

    // Search input
    const searchInput = this.shadow.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', this.handleSearchInput);
      searchInput.addEventListener('keydown', this.handleSearchKeyDown, { capture: true });
      searchInput.addEventListener('keyup', this.handleSearchKeyUp, { capture: true });
    }
    const clearBtn = this.shadow.getElementById('clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', this.handleSearchClear);
      this.updateClearButtonVisibility();
    }

    // Manage tags
    const manageTagsBtn = this.shadow.getElementById('manage-tags-button');
    if (manageTagsBtn) {
      manageTagsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleManageTagsClick();
      });
    }

    // Header ellipsis dropdown
    const headerEllipsis = this.shadow.getElementById('header-ellipsis');
    const headerMenu = this.shadow.getElementById('header-dropdown-menu');
    if (headerEllipsis && headerMenu) {
      headerEllipsis.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close any open dropdowns first
        this.shadow.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        headerMenu.classList.toggle('open');
      });
    }

    // Tag buttons
    const tagsContainer = this.shadow.getElementById('tags-container');
    if (tagsContainer) {
      tagsContainer.addEventListener('click', (e) => {
        const selector = '[data-tag]';
        let target = null;
        if (typeof e.composedPath === 'function') {
          for (const node of e.composedPath()) {
            if (node && node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(selector)) {
              target = node;
              break;
            }
          }
        }
        if (!target) {
          let el = e.target;
          if (!el || el.nodeType !== Node.ELEMENT_NODE) {
            el = el?.parentElement || null;
          }
          target = el && el.closest ? el.closest(selector) : null;
        }
        if (target && target.dataset.tag) {
          this.handleTagClick(target.dataset.tag);
        }
      });
    }

    // Dropdown buttons
    this.shadow.querySelectorAll('[data-dropdown]').forEach(button => {
      button.addEventListener('click', (e) => {
        const dropdownId = parseInt(button.dataset.dropdown || '0');
        this.handleDropdownClick(e, dropdownId);
      });
    });

    // Copy buttons
    this.shadow.querySelectorAll('[data-copy-id]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button;
        const promptId = parseInt(target.dataset.copyId || '0');
        const prompt = this.state.prompts.find(p => p.id === promptId);
        if (prompt) this.handleCopyClick(prompt);
      });
    });

    // Edit buttons
    this.shadow.querySelectorAll('[data-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button;
        this.handleEditClick(parseInt(target.dataset.edit || '0'));
      });
    });

    // Delete buttons
    this.shadow.querySelectorAll('[data-delete]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button;
        this.handleDeleteClick(parseInt(target.dataset.delete || '0'));
      });
    });

    // Expand buttons
    this.shadow.querySelectorAll('[data-expand]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button;
        this.handleExpandClick(parseInt(target.dataset.expand || '0'));
      });
    });

    // Form buttons
    const addSubmit = this.shadow.getElementById('add-submit');
    const addCancel = this.shadow.getElementById('add-cancel');
    const editSubmit = this.shadow.getElementById('edit-submit');
    const editCancel = this.shadow.getElementById('edit-cancel');
    const addChipInput = this.shadow.getElementById('add-chip-input');
    const editChipInput = this.shadow.getElementById('edit-chip-input');
    const manageCancel = this.shadow.getElementById('manage-cancel');
    const addTitle = this.shadow.getElementById('add-title');
    const addContent = this.shadow.getElementById('add-content');
    const editTitle = this.shadow.getElementById('edit-title');
    const editContent = this.shadow.getElementById('edit-content');
    const addDesc = this.shadow.getElementById('add-description');
    const editDesc = this.shadow.getElementById('edit-description');

    if (addSubmit) addSubmit.addEventListener('click', () => this.handleFormSubmit(false));
    if (addCancel) addCancel.addEventListener('click', this.handleFormCancel);
    if (editSubmit) editSubmit.addEventListener('click', () => this.handleFormSubmit(true));
    if (editCancel) editCancel.addEventListener('click', this.handleFormCancel);
    if (manageCancel) manageCancel.addEventListener('click', this.handleFormCancel);

    // Tag suggestions click
    this.shadow.querySelectorAll('.tag-suggestion').forEach(button => {
      button.addEventListener('click', () => {
        const formType = button.dataset.form;
        const tag = button.dataset.tag || '';
        this.addChip(formType, tag);
      });
    });

    // Chip input handlers
    const bindChipInput = (formType, inputEl) => {
      if (!inputEl) return;
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const value = inputEl.value.trim().replace(/,$/, '');
          if (value) this.addChip(formType, value);
          inputEl.value = '';
        } else if (e.key === 'Backspace' && inputEl.value === '') {
          // Remove last chip
          const chips = this.getChips(formType);
          if (chips.length > 0) {
            const last = chips[chips.length - 1];
            this.removeChip(formType, last);
          }
        }
      });
    };

    bindChipInput('add', addChipInput);
    bindChipInput('edit', editChipInput);

    // Chip remove buttons
    this.shadow.querySelectorAll('.chip-remove').forEach(button => {
      button.addEventListener('click', () => {
        const formType = button.dataset.form;
        const tag = button.dataset.tag || '';
        this.removeChip(formType, tag);
        this.updateFormValidity(formType);
      });
    });

    // Global tag delete
    this.shadow.querySelectorAll('[data-delete-tag]').forEach(button => {
      button.addEventListener('click', () => {
        const tag = button.getAttribute('data-delete-tag') || '';
        if (!tag) return;
        this.deleteTagGlobally(tag);
      });
    });

    // Revalidate on input changes
    const attachValidate = (formType, el) => el && el.addEventListener('input', () => this.updateFormValidity(formType));
    attachValidate('add', addTitle);
    attachValidate('add', addContent);
    attachValidate('add', addDesc);
    attachValidate('edit', editTitle);
    attachValidate('edit', editContent);
    attachValidate('edit', editDesc);
    if (addChipInput) addChipInput.addEventListener('input', () => this.updateFormValidity('add'));
    if (editChipInput) editChipInput.addEventListener('input', () => this.updateFormValidity('edit'));
    // initial validation
    this.updateFormValidity('add');
    this.updateFormValidity('edit');
  }

  render() {
    const filteredPrompts = this.getFilteredPrompts();
    const slice = filteredPrompts.slice(0, this.state.visibleCount);
    const allTags = this.getAllTags();

    this.shadow.innerHTML = `
      <style>
        /* Theme variables and base typography */
        :host {
          display: block;
          font-family: 'Roboto', system-ui;
          font-size: 14px;
          line-height: 1.4;
          /* Theme-aware variables with robust fallbacks */
          --pm-surface: var(--md-sys-color-surface-container-low, var(--ha-card-background, var(--card-background-color, #1B1C26)));
          --pm-surface-strong: var(--md-sys-color-surface-container, var(--secondary-background-color, #2B2A37));
          --pm-surface-weak: var(--md-sys-color-surface, var(--primary-background-color, #12131C));
          --pm-text: var(--md-sys-color-on-surface, var(--primary-text-color, #EEEDF5));
          --pm-subtext: var(--md-sys-color-on-surface-variant, var(--secondary-text-color, #666570));
          --pm-border: var(--md-sys-color-outline-variant, var(--divider-color, #41414C));
          --pm-border-soft: var(--md-sys-color-outline, var(--stroke-color, #666570));
          --pm-accent: var(--md-sys-color-primary, var(--accent-color, #72A3D3));
          --pm-danger: var(--md-sys-color-error, var(--error-color, #E53935));
          --pm-success: var(--success-color, var(--state-active-color, #34C759));
          --pm-overlay: var(--mdc-dialog-scrim-color, rgba(0, 0, 0, 0.8));
        }

        * {
          box-sizing: border-box;
        }

        /* Card container */
        .container {
          background: var(--pm-surface-weak);
          color: var(--pm-text);
          /* Use a theme-derived corner radius for the outer container */
          border-radius: var(--md-sys-shape-corner-large, 16px);
          overflow: hidden;
          padding: 24px;
        }

        /* Header area */
        .header {
          border-bottom: 1px solid var(--pm-border);
          margin-bottom: 24px;
          padding-bottom: 24px;
        }

        /* Header top row: actions and add button */
        .header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .header-top.only-actions {
          justify-content: flex-end;
          gap: 12px;
        }

        /* Title text */
        .title {
          margin: 0;
          font-size: 24px;
          font-weight: 500;
          color: var(--pm-text);
        }

        /* Add button */
        .add-button {
          /* Rounded shape matching Material You buttons */
          border-radius: var(--md-sys-shape-corner-large, 16px);
          /* Use accent colour for the outline to tie into the overall palette */
          background: var(--pm-surface-strong);
          border: 1px solid var(--pm-accent);
          color: var(--pm-accent);
          padding: 8px 16px;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }

        .add-button:hover {
          /* Fill on hover for clearer affordance */
          background: var(--pm-accent);
          color: var(--pm-surface-weak);
          border-color: var(--pm-accent);
        }

        /* Manage tags button */
        .manage-button {
          border-radius: var(--md-sys-shape-corner-large, 16px);
          background: var(--pm-surface-strong);
          border: 1px solid var(--pm-border);
          color: var(--pm-text);
          padding: 8px 16px;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }

        .manage-button:hover {
          background: var(--pm-border);
          border-color: var(--pm-border-soft);
        }

        /* Search bar */
        .search-container {
          position: relative;
          margin-bottom: 16px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--pm-subtext);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          background: var(--divider-color, #e0e0e0);
          border: none;
          border-radius: 20px;
          padding: 8px 12px 8px 36px;
          color: var(--pm-text);
          font-size: 13px;
          outline: none;
        }
        .clear-button {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: var(--pm-surface-strong);
          border: 1px solid var(--pm-border);
          color: var(--pm-subtext);
          /* Increase radius to match other controls */
          border-radius: var(--md-sys-shape-corner-medium, 12px);
          padding: 4px 8px;
          font-size: 11px;
          line-height: 1;
          cursor: pointer;
          display: none;
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }

        .clear-button:hover {
          color: var(--pm-text);
          border-color: var(--pm-border-soft);
        }

        .search-input:focus {
          border: 2.5px solid var(--info-color);
        }

        /* Tag filter row */
        .categories {
          padding-bottom: 24px;
        }

        .categories h3 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 500;
          color: var(--pm-text);
        }

        .tags-container {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .tag-button {
          background: var(--pm-surface);
          border: 1px solid var(--pm-border);
          border-radius: var(--md-sys-shape-corner-large, 16px);
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          color: var(--pm-text);
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }

        .tag-button.selected {
          background: var(--pm-accent);
          border-color: var(--pm-accent);
          color: var(--pm-surface-weak);
        }

        .tag-button:not(.selected):hover {
          background: var(--pm-surface-strong);
          border-color: var(--pm-border-soft);
        }

        /* Content grid wrapper */
        .content {
          margin-top: 24px;
        }

        /* Prompts grid layout */
        .prompts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 16px;
        }

        /* Individual prompt card */
        .prompt-card {
          background: var(--pm-surface);
          border: 1px solid transparent;
          /* Use a theme-derived corner radius for prompt cards */
          border-radius: var(--md-sys-shape-corner-large, 16px);
          padding: 16px;
          transition: all 0.2s ease;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .prompt-card:hover {
          border-color: var(--info-color);
          background: var(--pm-surface-strong);
        }

        /* Card header (title + actions) */
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        /* Card title */
        .card-title {
          margin: 0;
          font-size: 15px;
          font-weight: 500;
          color: var(--pm-text);
          flex: 1;
          margin-right: 12px;
        }

        /* Dropdown (per-card menu) */
        .dropdown-container {
          position: relative;
        }

        /* Action buttons group */
        .card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Icon buttons (ellipsis, copy, description) */
        .dropdown-button,
        .copy-button,
        .info-button {
          background: none;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          padding: 0;
          cursor: pointer;
          color: var(--primary-text-color);
          transition: color 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .dropdown-button:hover,
        .copy-button:hover,
        .info-button:hover {
          background: none;
          color: var(--primary-text-color);
          border-color: transparent;
        }

        /* Ensure inner icons do not swallow click events */
        .dropdown-button svg { pointer-events: none; }
        .copy-button svg { pointer-events: none; }
        .info-button ha-icon, .info-button svg { pointer-events: none; }

        /* Dropdown menu */
        .dropdown-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          background: var(--md-menu-container-color, var(--card-background-color));
          border: none;
          /* Rounded corners matching other components */
          border-radius: var(--md-sys-shape-corner-large, 16px);
          overflow: hidden;
          z-index: 100;
          min-width: 120px;
          box-shadow: var(--md-sys-elevation-level2, 0 2px 6px rgba(0,0,0,0.5));
          display: none;
        }

        .dropdown-menu.open { display: block; }

        /* Info button and popover (description reveal) */
        .info-container { position: relative; }
        /* info-button now shares styles with icon buttons above */

        .description-popover {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          z-index: 200;
          min-width: 260px;
          max-width: 420px;
          background: var(--md-dialog-container-color, var(--card-background-color));
          border: none; /* No borders on popups */
          border-radius: var(--md-dialog-container-shape-start-start, var(--md-dialog-container-shape, var(--md-sys-shape-corner-extra-large, 28px)));
          box-shadow: var(--md-sys-elevation-level3, 0 8px 24px rgba(0,0,0,0.35));
          opacity: 0;
          transform: translateY(-6px) scale(0.98);
          transition: opacity 180ms ease, transform 180ms ease;
          pointer-events: none;
        }
        .description-popover.open {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }
        .description-content {
          padding: 12px;
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-m);
          line-height: var(--ha-line-height-normal);
          font-weight: var(--ha-font-weight-normal);
          font-family: var(--md-dialog-supporting-text-font, var(--md-sys-typescale-body-medium-font, var(--md-ref-typeface-plain, Roboto)));
          max-height: 60vh;
          overflow: auto;
          scrollbar-width: none;            /* Firefox */
          -ms-overflow-style: none;         /* IE 10+ */
        }
        .description-content::-webkit-scrollbar { display: none; }

        /* Dropdown menu items */
        .dropdown-item {
          width: 100%;
          background: none;
          border: none;
          padding: 8px 12px;
          color: var(--pm-text);
          cursor: pointer;
          font-size: 13px;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .dropdown-item:hover {
          background: rgba(from var(--md-list-item-hover-state-layer-color, var(--md-sys-color-on-surface)) r g b / var(--md-list-item-hover-state-layer-opacity, 0.08));
          color: var(--primary-text-color);
        }

        .dropdown-item.danger {
          color: var(--pm-danger);
        }

        .dropdown-item.danger:hover {
          background: var(--pm-danger);
          color: var(--pm-surface-weak);
        }

        /* Main content area (prompt body + show more) */
        .card-content {
          margin-bottom: 12px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--pm-subtext);
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
        }

        .card-description {
          color: var(--pm-subtext);
          font-size: 12px;
          opacity: 0.85;
          margin-bottom: 8px;
        }

        /* Prompt body text */
        .card-content pre {
          font-family: inherit;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          text-align: justify;
          hyphens: auto;
        }

        /* Show more/less toggle */
        .show-more-button {
          background: none;
          border: none;
          color: var(--pm-accent);
          cursor: pointer;
          font-size: 12px;
          margin-top: 8px;
          padding: 0;
          align-self: flex-start;
        }

        /* Tag pills row */
        .card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
          margin-bottom: 16px;
        }

        /* Tag pill styling */
        .card-tag {
          background: var(--tag-bg, var(--pm-surface-strong));
          border: none;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 400;
          color: var(--tag-text, var(--primary-text-color, var(--pm-text))));
          box-shadow: inset 0 0 0 1px var(--tag-bg, var(--pm-border));
          letter-spacing: .2px;
        }

        /* Copy button */
        .copy-button {
          background: none;
          border: none;
          border-radius: var(--md-sys-shape-corner-medium, 12px);
          padding: 6px 10px;
          color: #fff;
          cursor: pointer;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: background 0.2s ease, color 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .copy-button:hover {
          background: var(--md-list-item-label-text-color, var(--md-sys-color-on-surface, #1d1b20));
          color: var(--pm-surface-weak);
        }

        /* Ensure icons within copy buttons do not intercept clicks */
        .copy-button svg { pointer-events: none; }

        /* Copy success animation state */
        .copy-button.copied {
          background: var(--pm-surface);
          color: var(--pm-success);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18), inset 0 0 0 1px currentColor;
          transition: background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease, transform 0.15s ease;
        }

        .copy-button.copied::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 12px;
          height: 12px;
          background: radial-gradient(circle, rgba(52,199,89,0.35) 0%, rgba(52,199,89,0) 70%);
          border-radius: 50%;
          transform: translate(-50%, -50%) scale(1);
          animation: copySuccessPulse 0.6s ease-out forwards;
          pointer-events: none;
        }

        /* Copy success pulse keyframes */
        @keyframes copySuccessPulse {
          0% { opacity: 0.9; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(14); }
        }

        /* Reduced motion handling */
        @media (prefers-reduced-motion: reduce) {
          .copy-button.copied { transform: none; box-shadow: 0 0 0 rgba(0,0,0,0); }
          .copy-button.copied::after { display: none; }
        }

        /* Modal overlay (add/edit/manage dialogs) */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--mdc-dialog-scrim-color, rgba(0, 0, 0, 0.8));
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 24px;
        }

        /* Modal window */
        .modal {
          background: var(--md-dialog-container-color, var(--card-background-color));
          border: none;
          border-radius: var(--md-dialog-container-shape-start-start, var(--md-dialog-container-shape, var(--md-sys-shape-corner-extra-large, 28px)));
          padding: 24px;
          width: 100%;
          max-width: 600px;
          max-height: 80vh;
          overflow: auto;
          scrollbar-width: none;            /* Firefox */
          -ms-overflow-style: none;         /* IE 10+ */
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-m);
          line-height: var(--ha-line-height-normal);
          font-weight: var(--ha-font-weight-normal);
          font-family: var(--md-dialog-supporting-text-font, var(--md-sys-typescale-body-medium-font, var(--md-ref-typeface-plain, Roboto)));
        }
        .modal::-webkit-scrollbar { display: none; }

        .modal h2 {
          margin: 0 0 16px;
          font-size: var(--ha-font-size-xl);
          color: var(--primary-text-color);
          font-family: var(--md-dialog-supporting-text-font, var(--md-sys-typescale-body-medium-font, var(--md-ref-typeface-plain, Roboto)));
        }

        /* Inputs */
        .form-input {
          width: 100%;
          background: var(--divider-color, #e0e0e0);
          border: none;
          border-radius: 20px;
          padding: 8px 12px;
          color: var(--pm-text);
          font-size: 13px;
          margin-bottom: 12px;
          outline: none;
        }

        /* Prompt/description textareas */
        .form-textarea {
          width: 100%;
          min-height: 150px;
          background: var(--divider-color, #e0e0e0);
          border: none;
          border-radius: 20px;
          padding: 12px;
          color: var(--pm-text);
          font-size: 13px;
          font-family: 'Roboto', monospace;
          line-height: 1.5;
          margin-bottom: 16px;
          outline: none;
          resize: vertical;
        }

        .form-input:focus,
        .form-textarea:focus {
          border: 2.5px solid var(--info-color);
        }

        /* Tag suggestion list in forms */
        .tag-suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 4px 0 12px 0;
        }

        .tag-suggestion {
          background: var(--pm-surface-strong);
          border: 1px solid var(--pm-accent);
          border-radius: var(--md-sys-shape-corner-medium, 12px);
          padding: 4px 8px;
          color: var(--pm-accent);
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }

        .tag-suggestion:hover {
          background: var(--pm-accent);
          color: var(--pm-surface-weak);
          border-color: var(--pm-accent);
        }

        /* Tag chips editor in forms */
        .tags-editor {
          background: var(--pm-surface);
          border: 1px dashed var(--pm-border);
          /* Larger radius to align with other containers */
          border-radius: var(--md-sys-shape-corner-large, 16px);
          padding: 8px;
          margin-bottom: 12px;
        }

        /* Manage Tags layout in the modal */
        .tags-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 50vh;
          overflow: auto;
          padding-right: 4px;
        }

        .tag-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          column-gap: 12px;
          padding: 8px 12px;
          border: 1px solid var(--pm-border);
          border-radius: 10px;
          background: var(--pm-surface-strong);
        }

        .tag-name {
          color: var(--pm-text);
          font-size: 13px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tag-count {
          color: var(--pm-subtext);
          font-size: 12px;
          white-space: nowrap;
        }

        .tag-row .form-button.danger {
          justify-self: end;
          min-width: 84px;
          /* Render tag deletion actions as outlined rather than filled to reduce visual weight */
          background: none;
          border: 1px solid var(--pm-danger);
          color: var(--pm-danger);
          border-radius: var(--md-sys-shape-corner-large, 16px);
          transition: background 0.2s ease, color 0.2s ease;
        }

        .tag-row .form-button.danger:hover {
          background: var(--pm-danger);
          color: var(--pm-surface-weak);
        }

        /* Generic chips layout */
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }

        /* Individual chip */
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--pm-surface-strong);
          border: 1px solid var(--pm-border);
          border-radius: 999px;
          padding: 4px 8px 4px 10px;
          color: var(--pm-accent);
          font-size: 12px;
        }

        /* Remove button on chips */
        .chip-remove {
          background: none;
          border: none;
          color: var(--pm-subtext);
          cursor: pointer;
          font-size: 12px;
          line-height: 1;
          padding: 2px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .chip-remove:hover { background: var(--pm-border); color: var(--pm-text); }
        .chip-remove svg { pointer-events: none; }

        /* Chip input */
        .chip-input {
          width: 100%;
          background: var(--divider-color, #e0e0e0);
          border: none;
          border-radius: 20px;
          padding: 6px 10px;
          color: var(--pm-text);
          font-size: 13px;
          outline: none;
        }

        .chip-input:focus { border: 2.5px solid var(--info-color); }

        /* Form buttons */
        .form-buttons {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 12px;
        }

        .form-button {
          border-radius: var(--md-sys-shape-corner-large, 16px);
          padding: 8px 16px;
          font-size: 13px;
          cursor: pointer;
          border: none;
          background: none;
          color: var(--pm-accent);
          transition: background 0.2s ease, color 0.2s ease;
        }

        /* Primary actions are filled with the accent colour */
        .form-button.primary {
          background: var(--pm-accent);
          color: var(--pm-surface-weak);
        }

        /* Danger actions use the error colour */
        .form-button.danger {
          background: var(--pm-danger);
          color: var(--pm-surface-weak);
        }

        .form-button:disabled {
          background: var(--pm-border);
          color: var(--pm-subtext);
          cursor: not-allowed;
        }

        /* Empty state placeholder */
        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: var(--pm-subtext);
        }

        /* Accessibility improvements */
        .dropdown-button:focus,
        .tag-button:focus,
        .copy-button:focus,
        .form-button:focus {
          outline: 2px solid var(--pm-accent);
          outline-offset: 2px;
        }

        /* Keyboard navigation support */
        .dropdown-menu:focus-within {
          display: block;
        }
      </style>

      <div class="container">
        <div class="header">
          <div class="header-top only-actions">
            <button class="add-button" id="add-button" aria-label="Add new prompt">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add
            </button>
            <div class="dropdown-container">
              <button class="dropdown-button" id="header-ellipsis" data-header-dropdown="true" aria-label="More options" aria-haspopup="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
              <div class="dropdown-menu" id="header-dropdown-menu" role="menu">
                <button class="dropdown-item" id="manage-tags-button" role="menuitem">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M7 7h.01"></path>
                    <path d="M3 3h7l7 7-7 7H3V3z"></path>
                  </svg>
                  Manage tags
                </button>
              </div>
            </div>
          </div>

          <div class="search-container">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              placeholder="Search prompts..."
              class="search-input"
              value="${this.escapeHtml(this.state.searchTerm)}"
              id="search-input"
              aria-label="Search prompts"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <button id="clear-search" class="clear-button" aria-label="Clear search" title="Clear">✕</button>
          </div>

          <div class="categories">
            <div class="tags-container" id="tags-container" role="group" aria-label="Filter by tags">
              ${allTags.map(tag => `
                <button
                  class="tag-button ${this.state.selectedTags.includes(tag) ? 'selected' : ''}"
                  data-tag="${this.escapeHtml(tag)}"
                  aria-pressed="${this.state.selectedTags.includes(tag)}"
                >
                  ${this.escapeHtml(tag)}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="content">
          ${filteredPrompts.length === 0 ? `
            <div class="empty-state">
              ${this.state.searchTerm || this.state.selectedTags.length > 0
                ? 'No prompts match your filters'
                : 'No prompts yet. Add your first one above.'
              }
            </div>
          ` : `
            <div class="prompts-grid" id="prompts-grid">
              ${slice.map(prompt => this.renderPromptCard(prompt)).join('')}
            </div>
          `}
        </div>
      </div>

      ${this.state.showAddForm ? this.renderAddForm() : ''}
      ${this.state.editingPrompt ? this.renderEditForm() : ''}
      ${this.state.showTagManager ? this.renderTagManager() : ''}
    `;

    this.setupEventListeners();
    this.setupContentEventListeners();
  }

  // Dynamic tag color helper: returns inline style variables for pills
  getTagStyle(tag) {
    const palette = this.getTagPalette(tag);
    return `style="--tag-bg:${palette.bg};--tag-text:${palette.text};--tag-ring:${palette.ring};"`;
  }

  // Determine readable text color (black or white) based on background color
  getReadableTextColor(bgColor) {
    try {
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const srgbToLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

      const hexToRgb = (hex) => {
        let h = hex.replace('#', '').trim();
        if (h.length === 3) {
          h = h.split('').map((ch) => ch + ch).join('');
        }
        const intVal = parseInt(h, 16);
        return {
          r: (intVal >> 16) & 255,
          g: (intVal >> 8) & 255,
          b: intVal & 255,
        };
      };

      const hslToRgb = (h, s, l) => {
        // h in [0,360], s,l in [0,1]
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r1 = 0, g1 = 0, b1 = 0;
        if (0 <= h && h < 60) { r1 = c; g1 = x; b1 = 0; }
        else if (60 <= h && h < 120) { r1 = x; g1 = c; b1 = 0; }
        else if (120 <= h && h < 180) { r1 = 0; g1 = c; b1 = x; }
        else if (180 <= h && h < 240) { r1 = 0; g1 = x; b1 = c; }
        else if (240 <= h && h < 300) { r1 = x; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = x; }
        return {
          r: Math.round((r1 + m) * 255),
          g: Math.round((g1 + m) * 255),
          b: Math.round((b1 + m) * 255),
        };
      };

      let rgb;
      const str = (bgColor || '').toString().trim().toLowerCase();
      if (str.startsWith('#')) {
        rgb = hexToRgb(str);
      } else if (str.startsWith('rgb')) {
        // rgb(a?) parsing
        const nums = str.match(/rgba?\(([^)]+)\)/);
        if (nums && nums[1]) {
          const parts = nums[1].split(',').map((v) => parseFloat(v));
          rgb = { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0 };
        }
      } else if (str.startsWith('hsl')) {
        const nums = str.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/);
        if (nums) {
          const h = parseFloat(nums[1]);
          const s = clamp01(parseFloat(nums[2]) / 100);
          const l = clamp01(parseFloat(nums[3]) / 100);
          rgb = hslToRgb(h, s, l);
        }
      }

      if (!rgb) {
        // Fallback to white text if parsing failed
        return '#FFFFFF';
      }

      const r = srgbToLinear(clamp01(rgb.r / 255));
      const g = srgbToLinear(clamp01(rgb.g / 255));
      const b = srgbToLinear(clamp01(rgb.b / 255));
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Threshold picked to balance readability across vivid colors
      return luminance > 0.57 ? '#000000' : '#FFFFFF';
    } catch {
      return '#FFFFFF';
    }
  }

  getTagPalette(tag) {
    const t = (tag || '').toString().toLowerCase();
    // Named color backgrounds (text is computed for contrast)
    const namedBg = {
      'coding': '#72A3D3',
      'writing': '#F1A226',
      'analysis': '#3BC1B5',
      'creative': '#BA68C8',
      'home-assistant': '#03A9F4',
      'lua': '#3F51B5',
      'userscripts': '#009688',
      'work': '#9E9E9E'
    };
    if (t in namedBg) {
      const bg = namedBg[t];
      return { bg, text: this.getReadableTextColor(bg), ring: bg };
    }
    // Hash-based hue for stable but varied colors
    let hash = 0;
    for (let i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const bg = `hsl(${hue}, 70%, 45%)`;
    return { bg, text: this.getReadableTextColor(bg), ring: bg };
  }

  // Lifecycle methods
  connectedCallback() {
    if (!this._outsideClickBound) {
      document.addEventListener('click', this.handleOutsideClick, true);
      this._outsideClickBound = true;
    }
    // ESC to close modals and dropdowns
    if (!this._escBound) {
      this._escHandler = (e) => {
        if (e.key === 'Escape') {
          // Close dropdowns
          this.shadow.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('open'));
          // Close modals if open
          if (this.state.showAddForm || this.state.editingPrompt || this.state.showTagManager) {
            this.handleFormCancel();
          }
        }
      };
      document.addEventListener('keydown', this._escHandler, true);
      this._escBound = true;
    }
    // Prevent HA global search ("/" key and others) from hijacking while typing
    this.addEventListener('keydown', (e) => {
      const active = this.shadow.getElementById('search-input');
      if (active && document.activeElement === active) {
        e.stopPropagation();
      }
    }, { capture: true });

    // Refresh prompts when tab becomes visible again (ensures cross-device updates are seen)
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.fetchPromptsFromBackend();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  disconnectedCallback() {
    if (this._outsideClickBound) {
      document.removeEventListener('click', this.handleOutsideClick, true);
      this._outsideClickBound = false;
    }
    if (this._escBound) {
      document.removeEventListener('keydown', this._escHandler, true);
      this._escBound = false;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }
}

// Static properties required by Home Assistant
PromptManagerCard.stub = true;

// Register the custom element
customElements.define('prompt-manager-card', PromptManagerCard);

