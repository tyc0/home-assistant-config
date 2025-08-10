class FlipAnimator extends HTMLElement {
  constructor() {
    super();
    this._observer = new MutationObserver(() => this.animate());
  }

  connectedCallback() {
    // Ensure the container positions its children relatively.
    this.style.position = 'relative';
    // Inject custom styles for the wobble if not already present.
    if (!document.getElementById('flip-animator-styles')) {
      const style = document.createElement('style');
      style.id = 'flip-animator-styles';
      style.textContent = `
        @keyframes wobble {
          0% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(0, 0) rotate(-3deg); }
          40% { transform: translate(0, 0) rotate(3deg); }
          60% { transform: translate(0, 0) rotate(-3deg); }
          80% { transform: translate(0, 0) rotate(3deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
      `;
      document.head.appendChild(style);
    }
    // Observe any child changes (addition, removal, attribute changes)
    this._observer.observe(this, { childList: true, subtree: true });
  }

  animate() {
    const items = Array.from(this.children);
    // Capture starting positions
    const firstRects = items.map(item => item.getBoundingClientRect());
    
    // Force layout reflow
    void this.offsetWidth;
    
    // Capture ending positions
    const lastRects = items.map(item => item.getBoundingClientRect());
    
    items.forEach((item, index) => {
      const deltaX = firstRects[index].left - lastRects[index].left;
      const deltaY = firstRects[index].top - lastRects[index].top;
      if (deltaX !== 0 || deltaY !== 0) {
        // Apply the inverse transform immediately
        item.style.transition = 'none';
        item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        // Calculate an index-based delay for a wave effect (50ms per item)
        const delay = index * 50; // Adjust delay as needed
        requestAnimationFrame(() => {
          // Transition back to the natural position with the delay
          item.style.transition = `transform 0.5s ease ${delay}ms`;
          item.style.transform = '';
          // Listen for the end of the transition on the transform property
          const onTransitionEnd = (event) => {
            if (event.propertyName !== 'transform') return;
            item.removeEventListener('transitionend', onTransitionEnd);
            // Trigger a brief wobble once the item settles
            item.style.animation = 'wobble 0.4s ease';
            const onAnimationEnd = () => {
              item.style.animation = '';
              item.removeEventListener('animationend', onAnimationEnd);
            };
            item.addEventListener('animationend', onAnimationEnd);
          };
          item.addEventListener('transitionend', onTransitionEnd);
        });
      }
    });
  }
}

customElements.define('flip-animator', FlipAnimator);
