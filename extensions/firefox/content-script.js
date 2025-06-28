// document.body.style.border = "5px solid red";

class TTSReader {
    constructor() {
        this.isReading = false;
        this.currentAudio = null;
        this.audioContext = null;
        this.currentAudioSource = null;
        this.readingIndex = 0;
        this.selectedElements = [];
        this.currentHighlightedElement = null;
        this.floatingButton = null;
        this.readTexts = new Set(); // Track texts we've already read
        
        // Default settings
        this.settings = {
            apiUrl: 'http://localhost:9942',
            voice: 'af_heart',
            speed: 1.2,
            speedBoost: 1.5,
            autoHighlight: true,
            skipDuplicates: true,
            showButton: true,
            keybind: 'alt+r'
        };
        
        this.init();
    }
    
    async init() {
        // Load settings from storage
        await this.loadSettings();
        
        // Listen for text selection events
        // document.addEventListener('mouseup', this.handleTextSelection.bind(this));
        // document.addEventListener('keyup', this.handleTextSelection.bind(this));
        document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
        
        // Clean up on page unload
        window.addEventListener('beforeunload', this.cleanup.bind(this));
        
        // Listen for settings updates from popup
        browser.runtime.onMessage.addListener(this.handleMessage.bind(this));
        
        // Listen for keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Create styles for highlighting
        this.createStyles();
    }

    handleSelectionChange() {
        console.log('selectionchange', window.getSelection().toString().trim());
        if (this.isReading) {
            return;
        }

        if (window.getSelection().toString().trim() === '') {
            this.hideFloatingButton();
        } else {
            this.showFloatingButton(window.getSelection());
        }
    }
    
    async loadSettings() {
        try {
            const result = await browser.storage.local.get('ttsSettings');
            if (result.ttsSettings) {
                this.settings = { ...this.settings, ...result.ttsSettings };
            }
        } catch (error) {
            console.error('Error loading TTS settings:', error);
        }
    }
    
    handleMessage(message, sender, sendResponse) {
        if (message.type === 'SETTINGS_UPDATED') {
            this.settings = { ...this.settings, ...message.settings };
        }
    }

    handleKeyDown(event) {
        // Build the current key combination
        const keys = [];
        if (event.ctrlKey) keys.push('ctrl');
        if (event.altKey) keys.push('alt');
        if (event.shiftKey) keys.push('shift');
        if (event.metaKey) keys.push('meta');
        keys.push(event.key.toLowerCase());
        
        const currentKeybind = keys.join('+');
        
        // Check if it matches our configured keybind
        if (currentKeybind === this.settings.keybind) {
            event.preventDefault();
            event.stopPropagation();
            
            if (this.isReading) {
                // Stop reading if currently reading
                this.stopReading();
            } else {
                // Start reading if text is selected
                const selection = window.getSelection();
                const selectedText = selection.toString().trim();
                
                if (selectedText.length > 0) {
                    const range = selection.getRangeAt(0);
                    this.startReading(selectedText, range);
                }
            }
        }
    }
    
    createStyles() {
        const style = document.createElement('style');
        style.innerText = `
            .tts-floating-button {
                position: absolute;
                background: rgb(76, 78, 192);
                color: white;
                border: none;
                border-radius: 16px;
                padding: 6px 12px;
                font-size: 12px;
                cursor: pointer;
                z-index: 10000;
                box-shadow: 0 1px 6px rgba(0,0,0,0.15);
                transition: all 0.1s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 500;
            }
            
            .tts-floating-button:hover {
                background: rgb(66, 67, 156);
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }
            
            .tts-floating-button.reading {
                background: rgb(223, 59, 48);
            }
            
            .tts-floating-button.reading:hover {
                background: rgb(189, 56, 46);
            }
            
            .tts-current-reading {
                background-color: #ffeb3b !important;
                color: #000 !important;
                border-radius: 3px;
            }
        `;
        document.head.appendChild(style);
    }
    
    handleTextSelection(event) {
        // Don't hide button if clicking on the button itself
        if (event && event.target && event.target.classList && 
            event.target.classList.contains('tts-floating-button')) {
            return;
        }
        
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText.length > 0) {
            this.showFloatingButton(selection);
        } else {
            // Only hide if we're not currently reading
            if (!this.isReading) {
                this.hideFloatingButton();
            }
        }
    }
    
    showFloatingButton(selection) {
        // Don't show button if disabled in settings
        if (!this.settings.showButton) {
            return;
        }
        
        // Don't recreate button if it already exists and we're reading
        if (this.floatingButton && this.isReading) {
            return;
        }
        
        this.hideFloatingButton();
        
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        this.floatingButton = document.createElement('button');
        this.floatingButton.className = 'tts-floating-button';
        this.floatingButton.innerText = '▶ Read';
        this.floatingButton.style.left = `${rect.right + 16 + window.scrollX}px`;
        this.floatingButton.style.top = `${rect.top - 8 + window.scrollY}px`;
        
        // Prevent the button from being removed when clicked
        this.floatingButton.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        this.floatingButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            if (this.isReading) {
                this.stopReading();
            } else {
                const currentSelection = window.getSelection();
                const currentText = currentSelection.toString().trim();
                
                // Use current selection if available, otherwise use stored text
                const textToRead = currentText || selection.toString().trim();
                this.startReading(textToRead, range);
            }
        });
        
        document.body.appendChild(this.floatingButton);
    }
    
    hideFloatingButton() {
        if (this.floatingButton) {
            this.floatingButton.remove();
            this.floatingButton = null;
        }
    }
    
    getElementsFromSelection(range) {
        // Get the actual selected text first
        const selectedText = range.toString().trim();
        if (!selectedText) return [];
        
        // Find meaningful content containers
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;
        
        // Define what we consider meaningful content containers
        const meaningfulContainers = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'DIV'];
        const inlineElements = ['A', 'SPAN', 'CODE', 'EM', 'STRONG', 'B', 'I', 'MARK', 'SMALL', 'SUB', 'SUP'];
        
        function findMeaningfulParent(node) {
            // Start from the node (or its parent if it's a text node)
            let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            
            // Walk up but only a limited distance to find a meaningful container
            let levels = 0;
            while (current && levels < 3) {
                if (meaningfulContainers.includes(current.tagName)) {
                    return current;
                }
                current = current.parentElement;
                levels++;
            }
            
            // If we can't find a meaningful container, use the immediate parent
            return node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        }
        
        const startElement = findMeaningfulParent(startContainer);
        const endElement = findMeaningfulParent(endContainer);
        
        const elements = new Set();
        
        if (startElement === endElement) {
            // Selection within single meaningful container - just read that
            elements.add(startElement);
        } else {
            // Multiple containers - collect meaningful containers between start and end
            const walker = document.createTreeWalker(
                range.commonAncestorContainer,
                NodeFilter.SHOW_ELEMENT,
                {
                    acceptNode: function(node) {
                        try {
                            // Only accept meaningful containers that intersect the selection
                            if (range.intersectsNode(node) && node.innerText.trim() &&
                                meaningfulContainers.includes(node.tagName)) {
                                return NodeFilter.FILTER_ACCEPT;
                            }
                            return NodeFilter.FILTER_SKIP;
                        } catch (error) {
                            console.error('Error in handleSelectionChange:', error);
                            return NodeFilter.FILTER_SKIP;
                        }
                    }
                },
                false
            );
            
            let node;
            while (node = walker.nextNode()) {
                elements.add(node);
            }
            
            // If we didn't find any meaningful containers, fall back to a simpler approach
            if (elements.size === 0) {
                elements.add(startElement);
                if (endElement !== startElement) {
                    elements.add(endElement);
                }
            }
        }
        
        // Convert to array and sort by document order
        // Note: We don't filter by range.intersectsNode here because once we've identified
        // meaningful containers, we want to read their entire content
        const finalElements = Array.from(elements).filter(el => 
            el && el.innerText.trim()
        );
        
        finalElements.sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
        
        return finalElements;
    }
    
    async startReading(text, range) {
        if (this.isReading) return;
        
        this.isReading = true;
        this.readingIndex = 0;
        
        // Clear previously read texts for new session (only if skipDuplicates is enabled)
        if (this.settings.skipDuplicates) {
            this.readTexts.clear();
        }
        
        this.selectedElements = this.getElementsFromSelection(range);
        
        // Clear text selection once reading begins
        window.getSelection().removeAllRanges();
        
        // Update button appearance
        if (this.floatingButton) {
            this.floatingButton.className = 'tts-floating-button reading';
            this.floatingButton.innerText = '⏹ Stop';
        }
        
        try {
            await this.readElements();
        } catch (error) {
            console.error('Error during TTS reading:', error);
            this.showError('Failed to read text. Make sure the TTS server is running.');
        } finally {
            this.stopReading();
        }
    }
    
    async readElements() {
        for (let i = 0; i < this.selectedElements.length && this.isReading; i++) {
            this.readingIndex = i;
            const element = this.selectedElements[i];
            
            const text = element.innerText.trim();
            
            // Skip if we've already read this exact text (only if skipDuplicates is enabled)
            if (!text || (this.settings.skipDuplicates && this.readTexts.has(text))) {
                continue;
            }
            
            // Highlight current element (only if autoHighlight is enabled)
            if (this.settings.autoHighlight) {
                this.highlightCurrentElement(element);
            }
            
            try {
                const audioBlob = await this.generateAudio(text);
                if (this.isReading) {
                    await this.playAudio(audioBlob);
                    // Mark this text as read only after successful playback (only if skipDuplicates is enabled)
                    if (this.settings.skipDuplicates) {
                        this.readTexts.add(text);
                    }
                }
            } catch (error) {
                console.error('Error generating/playing audio for element:', error);
                throw error;
            }
            
            // Remove highlight after reading (only if autoHighlight is enabled)
            if (this.settings.autoHighlight) {
                this.removeHighlight();
            }
        }
    }
    
    highlightCurrentElement(element) {
        this.removeHighlight();
        element.classList.add('tts-current-reading');
        this.currentHighlightedElement = element;
    }
    
    removeHighlight() {
        if (this.currentHighlightedElement) {
            this.currentHighlightedElement.classList.remove('tts-current-reading');
            this.currentHighlightedElement = null;
        }
    }
    
    async generateAudio(text) {
        const response = await fetch(`${this.settings.apiUrl}/generate-audio`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                voice: this.settings.voice,
                speed: this.settings.speed,
                speed_boost: this.settings.speedBoost
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.blob();
    }
    
    async playAudio(audioBlob) {
        return new Promise(async (resolve, reject) => {
            try {
                // Initialize AudioContext if not already done
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                
                // Resume context if suspended (required by some browsers)
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                
                // Convert blob to ArrayBuffer
                const arrayBuffer = await audioBlob.arrayBuffer();
                
                // Decode audio data
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                
                // Create audio source
                this.currentAudioSource = this.audioContext.createBufferSource();
                this.currentAudioSource.buffer = audioBuffer;
                this.currentAudioSource.connect(this.audioContext.destination);
                
                // Set up event handlers
                this.currentAudioSource.addEventListener('ended', () => {
                    this.currentAudioSource = null;
                    resolve();
                });
                
                // Start playback
                this.currentAudioSource.start(0);
                
            } catch (error) {
                console.error('Audio playback error:', error);
                reject(new Error('Audio playback failed: ' + error.message));
            }
        });
    }
    
    stopReading() {
        this.isReading = false;
        
        // Stop current audio playback
        if (this.currentAudioSource) {
            try {
                this.currentAudioSource.stop();
            } catch (e) {
                // Ignore errors if already stopped
            }
            this.currentAudioSource = null;
        }
        
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        
        this.removeHighlight();
        
        if (this.floatingButton) {
            this.floatingButton.className = 'tts-floating-button';
            this.floatingButton.innerText = '▶ Read';
        }
        
        this.selectedElements = [];
        this.readingIndex = 0;
        
        // Clear read texts for next session (only if skipDuplicates is enabled)
        if (this.settings.skipDuplicates) {
            this.readTexts.clear();
        }
    }
    
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        errorDiv.innerText = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }
    
    cleanup() {
        this.stopReading();
        this.hideFloatingButton();
        
        // Clean up AudioContext
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

// Initialize the TTS reader when the content script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new TTSReader();
    });
} else {
    new TTSReader();
}