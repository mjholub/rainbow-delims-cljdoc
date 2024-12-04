// ==UserScript==
// @name         Rainbow Delimiters for cljdoc.org
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds rainbow delimiters to code blocks on cljdoc.org
// @author       Marcelina Hołub 
// @match        https://cljdoc.org/*
// @grant        none
// ==/UserScript==

// Color utility class with static methods for color conversions and calculations
class ColorUtils {
    static RGB_TO_HSL = {
        convert(r, g, b) {
            r /= 255;
            g /= 255;
            b /= 255;
            
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const d = max - min;
            const l = (max + min) / 2;
            
            if (d === 0) return { h: 0, s: 0, l };
            
            const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            let h = max === r 
                ? (g - b) / d + (g < b ? 6 : 0)
                : max === g 
                    ? (b - r) / d + 2 
                    : (r - g) / d + 4;
            
            h *= 60;
            if (h < 0) h += 360;
            
            return { h, s: s * 100, l: l * 100 };
        }
    };

    static HSL_TO_RGB = {
        convert(h, s, l) {
            s /= 100;
            l /= 100;
            
            const c = (1 - Math.abs(2 * l - 1)) * s;
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            const m = l - c / 2;
            
            let [r, g, b] = [0, 0, 0];
            
            if (h < 60) [r, g, b] = [c, x, 0];
            else if (h < 120) [r, g, b] = [x, c, 0];
            else if (h < 180) [r, g, b] = [0, c, x];
            else if (h < 240) [r, g, b] = [0, x, c];
            else if (h < 300) [r, g, b] = [x, 0, c];
            else [r, g, b] = [c, 0, x];
            
            return {
                r: Math.round((r + m) * 255),
                g: Math.round((g + m) * 255),
                b: Math.round((b + m) * 255)
            };
        }
    };

    static hslToHex(h, s, l) {
        const rgb = this.HSL_TO_RGB.convert(h, s, l);
        return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
    }
}

// Color palette generator for rainbow delimiters
class ColorPaletteGenerator {
    static generateBaseColors(count = 32) {
        const colors = [];
        const hueStep = 360 / count;
        
        for (let i = 0; i < count; i++) {
            colors.push({
                h: i * hueStep,
                s: 70, // Base saturation
                l: 50  // Base lightness
            });
        }
        
        return colors;
    }
}

// Context-aware color adjustment
class ColorAdjuster {
    static detectDarkMode() {
        return document.querySelector('html[data-darkreader-mode]') !== null;
    }

    static getBackgroundLuminance(element) {
        const style = getComputedStyle(element);
        const bgColor = style.backgroundColor;
        const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        
        if (!match) return 0.5;
        
        const [_, r, g, b] = match.map(Number);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    static adjustColor(baseColor, depth) {
        const isDarkMode = this.detectDarkMode();
        const adjustedColor = { ...baseColor };
        
        // Adjust lightness based on depth and context
        const baseLightness = isDarkMode ? 65 : 35;
        const depthAdjustment = (depth % 3) * (isDarkMode ? -5 : 5);
        adjustedColor.l = baseLightness + depthAdjustment;
        
        // Reduce saturation for deeper nesting
        adjustedColor.s = Math.max(40, baseColor.s - (Math.floor(depth / 3) * 10));
        
        return adjustedColor;
    }
}

// Rainbow delimiters processor
class RainbowDelimiters {
    constructor() {
        this.baseColors = ColorPaletteGenerator.generateBaseColors();
        this.processedAttribute = 'data-rainbow-processed';
        this.delimiter_pairs = {
            '(': ')',
            '[': ']',
            '{': '}'
        };
    }

    processText(node) {
        const text = node.textContent;
        let result = '';
        let lastIndex = 0;
        let depth = 0;
        
        const colorStack = [];
        const usedColors = new Set();

        const getNextColor = (depth) => {
            const availableColors = this.baseColors.filter(c => !usedColors.has(c));
            if (availableColors.length === 0) {
                usedColors.clear();
                return this.baseColors[depth % this.baseColors.length];
            }
            
            const color = availableColors[depth % availableColors.length];
            usedColors.add(color);
            return color;
        };

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const isOpening = Object.keys(this.delimiter_pairs).includes(char);
            const isClosing = Object.values(this.delimiter_pairs).includes(char);

            if (isOpening || isClosing) {
                result += text.substring(lastIndex, i);
                
                const baseColor = isOpening ? getNextColor(depth) : colorStack.pop() || getNextColor(depth);
                const adjustedColor = ColorAdjuster.adjustColor(baseColor, depth);
                const hexColor = ColorUtils.hslToHex(adjustedColor.h, adjustedColor.s, adjustedColor.l);
                
                result += `<span style="color: ${hexColor}">${char}</span>`;
                
                if (isOpening) {
                    colorStack.push(baseColor);
                    depth++;
                } else {
                    depth = Math.max(0, depth - 1);
                }
                
                lastIndex = i + 1;
            }
        }
        
        result += text.substring(lastIndex);
        return result;
    }

    applyToDocument() {
        const preBlocks = document.querySelectorAll(`pre:not([${this.processedAttribute}])`);
        preBlocks.forEach(pre => {
            pre.innerHTML = this.processText(pre);
            pre.setAttribute(this.processedAttribute, 'true');
        });
    }

    observe() {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    this.applyToDocument();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

// Initialize and run
(function() {
    'use strict';
    
    const rainbowDelimiters = new RainbowDelimiters();
    rainbowDelimiters.applyToDocument();
    rainbowDelimiters.observe();
})();
