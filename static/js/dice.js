/**
 * dice.js — Chowkabara SVG Dice Engine
 * Renders a fully animated SVG dice with correct pip layout
 * and a realistic rolling animation using CSS 3D transforms.
 */

const DICE_PIPS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 22], [75, 22], [25, 50], [75, 50], [25, 78], [75, 78]]
};

// Color theme per player
const DICE_COLORS = {
  blue:   { face: '#1e3a5f', pip: '#93c5fd', border: '#3b82f6', glow: '#3b82f6' },
  red:    { face: '#5f1e1e', pip: '#fca5a5', border: '#ef4444', glow: '#ef4444' },
  green:  { face: '#1e4d2b', pip: '#6ee7b7', border: '#10b981', glow: '#10b981' },
  yellow: { face: '#5f4a0e', pip: '#fde68a', border: '#f59e0b', glow: '#f59e0b' },
  default:{ face: '#1a1a2e', pip: '#f1f5f9', border: '#6366f1', glow: '#6366f1' }
};

class SVGDice {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.size = options.size || 120;
    this.isRolling = false;
    this.currentValue = 1;
    this.colorTheme = DICE_COLORS['default'];
    this._buildDOM();
  }

  _buildDOM() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'svg-dice-wrapper';
    this.wrapper.style.cssText = `
      width: ${this.size}px;
      height: ${this.size}px;
      perspective: 600px;
      display: inline-block;
      position: relative;
    `;

    this.scene = document.createElement('div');
    this.scene.className = 'svg-dice-scene';
    this.scene.style.cssText = `
      width: 100%;
      height: 100%;
      position: relative;
      transform-style: preserve-3d;
      transition: transform 0.15s ease;
      cursor: pointer;
      filter: drop-shadow(0 0 0px transparent);
    `;

    // Build the SVG face
    this.svg = this._createFaceSVG(this.currentValue);
    this.scene.appendChild(this.svg);
    this.wrapper.appendChild(this.scene);
    this.container.appendChild(this.wrapper);

    // Shadow below dice
    this.shadow = document.createElement('div');
    this.shadow.style.cssText = `
      width: ${this.size * 0.7}px;
      height: 10px;
      background: radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%);
      margin: 4px auto 0;
      transition: opacity 0.3s ease;
    `;
    this.container.appendChild(this.shadow);

    // Inject rolling keyframes once
    if (!document.getElementById('dice-keyframes')) {
      const style = document.createElement('style');
      style.id = 'dice-keyframes';
      style.textContent = `
        @keyframes diceRoll3D {
          0%   { transform: rotateX(0deg)    rotateY(0deg)    rotateZ(0deg) scale(1); }
          10%  { transform: rotateX(180deg)  rotateY(90deg)   rotateZ(45deg) scale(1.1); }
          20%  { transform: rotateX(360deg)  rotateY(180deg)  rotateZ(90deg) scale(1); }
          30%  { transform: rotateX(90deg)   rotateY(270deg)  rotateZ(135deg) scale(1.05); }
          40%  { transform: rotateX(270deg)  rotateY(45deg)   rotateZ(180deg) scale(0.95); }
          50%  { transform: rotateX(180deg)  rotateY(360deg)  rotateZ(225deg) scale(1.1); }
          60%  { transform: rotateX(360deg)  rotateY(270deg)  rotateZ(270deg) scale(1); }
          70%  { transform: rotateX(270deg)  rotateY(180deg)  rotateZ(315deg) scale(1.05); }
          80%  { transform: rotateX(180deg)  rotateY(90deg)   rotateZ(360deg) scale(1); }
          90%  { transform: rotateX(90deg)   rotateY(45deg)   rotateZ(45deg) scale(0.98); }
          100% { transform: rotateX(0deg)    rotateY(0deg)    rotateZ(0deg) scale(1); }
        }
        @keyframes diceLand {
          0%   { transform: scale(1.15) translateY(-6px); }
          40%  { transform: scale(0.92) translateY(2px); }
          70%  { transform: scale(1.05) translateY(-2px); }
          100% { transform: scale(1) translateY(0px); }
        }
        @keyframes diceGlow {
          0%, 100% { filter: drop-shadow(0 0 8px var(--dice-glow)); }
          50%       { filter: drop-shadow(0 0 20px var(--dice-glow)); }
        }
        .svg-dice-scene.rolling {
          animation: diceRoll3D 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .svg-dice-scene.landing {
          animation: diceLand 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .svg-dice-scene.glowing {
          animation: diceGlow 1.5s ease-in-out infinite;
        }
      `;
      document.head.appendChild(style);
    }
  }

  _createFaceSVG(value) {
    const s = this.size;
    const c = this.colorTheme;
    const ns = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.style.cssText = 'display:block; border-radius: 18px; overflow: hidden;';

    // Gradient defs
    const defs = document.createElementNS(ns, 'defs');

    const grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'diceGrad');
    grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '100%');
    const s1 = document.createElementNS(ns, 'stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('style', `stop-color:${this._lighten(c.face, 20)};stop-opacity:1`);
    const s2 = document.createElementNS(ns, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('style', `stop-color:${c.face};stop-opacity:1`);
    grad.appendChild(s1); grad.appendChild(s2);

    const pipGrad = document.createElementNS(ns, 'radialGradient');
    pipGrad.setAttribute('id', 'pipGrad');
    const p1 = document.createElementNS(ns, 'stop');
    p1.setAttribute('offset', '0%');
    p1.setAttribute('style', `stop-color:#ffffff;stop-opacity:0.9`);
    const p2 = document.createElementNS(ns, 'stop');
    p2.setAttribute('offset', '100%');
    p2.setAttribute('style', `stop-color:${c.pip};stop-opacity:1`);
    pipGrad.appendChild(p1); pipGrad.appendChild(p2);

    defs.appendChild(grad);
    defs.appendChild(pipGrad);
    svg.appendChild(defs);

    // Background face
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '2'); rect.setAttribute('y', '2');
    rect.setAttribute('width', '96'); rect.setAttribute('height', '96');
    rect.setAttribute('rx', '16'); rect.setAttribute('ry', '16');
    rect.setAttribute('fill', 'url(#diceGrad)');
    rect.setAttribute('stroke', c.border);
    rect.setAttribute('stroke-width', '2.5');
    svg.appendChild(rect);

    // Top highlight
    const shine = document.createElementNS(ns, 'rect');
    shine.setAttribute('x', '10'); shine.setAttribute('y', '5');
    shine.setAttribute('width', '80'); shine.setAttribute('height', '30');
    shine.setAttribute('rx', '12'); shine.setAttribute('ry', '12');
    shine.setAttribute('fill', 'rgba(255,255,255,0.07)');
    svg.appendChild(shine);

    // Pips
    const pips = DICE_PIPS[value] || DICE_PIPS[1];
    pips.forEach(([cx, cy]) => {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', '7.5');
      circle.setAttribute('fill', 'url(#pipGrad)');
      // Inner shadow on pip
      circle.setAttribute('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))');
      svg.appendChild(circle);
    });

    return svg;
  }

  _lighten(hex, amount) {
    // Simple lighten: parse and add amount to RGB
    try {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.min(255, (num >> 16) + amount);
      const g = Math.min(255, ((num >> 8) & 0xff) + amount);
      const b = Math.min(255, (num & 0xff) + amount);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch { return hex; }
  }

  setColor(playerColor) {
    this.colorTheme = DICE_COLORS[playerColor] || DICE_COLORS['default'];
    this.scene.style.setProperty('--dice-glow', this.colorTheme.glow);
    this.showValue(this.currentValue); // redraw with new color
  }

  showValue(value) {
    this.currentValue = value;
    // Replace the SVG
    const oldSvg = this.scene.querySelector('svg');
    if (oldSvg) oldSvg.remove();
    const newSvg = this._createFaceSVG(value);
    this.scene.appendChild(newSvg);
  }

  /**
   * Roll the dice with animation, then display `finalValue`.
   * @param {number} finalValue - The value to land on (1-6)
   * @param {function} onComplete - Callback after animation finishes
   */
  roll(finalValue, onComplete) {
    if (this.isRolling) return;
    this.isRolling = true;

    this.scene.classList.remove('glowing');
    this.scene.classList.add('rolling');
    this.shadow.style.opacity = '0.3';

    // Rapid random faces during roll
    let ticks = 0;
    const totalTicks = 14;
    const interval = setInterval(() => {
      ticks++;
      const randomFace = Math.floor(Math.random() * 6) + 1;
      this.showValue(randomFace);
      if (ticks >= totalTicks) {
        clearInterval(interval);
      }
    }, 55);

    // After roll animation ends, show final value
    setTimeout(() => {
      this.scene.classList.remove('rolling');
      this.showValue(finalValue);
      this.scene.classList.add('landing');
      this.shadow.style.opacity = '1';

      setTimeout(() => {
        this.scene.classList.remove('landing');
        this.scene.classList.add('glowing');
        this.isRolling = false;
        if (typeof onComplete === 'function') onComplete(finalValue);
      }, 360);
    }, 800);
  }

  /**
   * Pulse the dice to indicate it's ready to roll
   */
  pulse() {
    this.scene.classList.add('glowing');
  }

  /**
   * Stop the glow pulse
   */
  stopPulse() {
    this.scene.classList.remove('glowing');
  }

  /**
   * Reset dice to neutral state (blank / show "--")
   */
  reset() {
    this.scene.classList.remove('glowing', 'rolling', 'landing');
    // Show face as dimmed 1
    this.showValue(1);
    const svg = this.scene.querySelector('svg');
    if (svg) svg.style.opacity = '0.35';
  }

  /**
   * Highlight with winner glow
   */
  celebrate(color) {
    this.setColor(color);
    this.scene.style.animation = 'diceGlow 0.5s ease-in-out infinite';
  }
}

// Export for use in main.js
window.SVGDice = SVGDice;
window.DICE_COLORS = DICE_COLORS;
