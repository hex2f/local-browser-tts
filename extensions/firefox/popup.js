// Default settings
const DEFAULT_SETTINGS = {
    apiUrl: 'http://localhost:8000',
    voice: 'af_heart',
    speed: 1.2,
    speedBoost: 1.5,
    autoHighlight: true,
    skipDuplicates: true,
    showButton: true,
    keybind: 'alt+r'
};

class PopupManager {
    constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.updateUI();
        this.checkConnection();
    }

    async loadSettings() {
        try {
            const result = await browser.storage.local.get('ttsSettings');
            if (result.ttsSettings) {
                this.settings = { ...DEFAULT_SETTINGS, ...result.ttsSettings };
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async saveSettings() {
        try {
            await browser.storage.local.set({ ttsSettings: this.settings });
            
            // Notify content scripts about settings change
            try {
                const tabs = await browser.tabs.query({});
                tabs.forEach(tab => {
                    browser.tabs.sendMessage(tab.id, {
                        type: 'SETTINGS_UPDATED',
                        settings: this.settings
                    }).catch(() => {
                        // Ignore errors for tabs that don't have content script
                    });
                });
            } catch (error) {
                console.log('Could not notify content scripts:', error);
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showMessage('Error saving settings. Please try again.', 'error');
        }
    }

    setupEventListeners() {
        // Reset button
        const resetBtn = document.getElementById('reset-btn');
        resetBtn.addEventListener('click', this.resetToDefaults.bind(this));

        // Test connection button
        const testBtn = document.getElementById('test-connection');
        testBtn.addEventListener('click', this.testConnection.bind(this));

        // Auto-save on all input changes
        this.setupAutoSave();
    }

    setupAutoSave() {
        // Range input value updates and auto-save
        const speedRange = document.getElementById('speed');
        const speedBoostRange = document.getElementById('speed-boost');
        
        speedRange.addEventListener('input', (e) => {
            document.getElementById('speed-value').textContent = e.target.value;
            this.settings.speed = parseFloat(e.target.value);
            this.debouncedSave();
        });
        
        speedBoostRange.addEventListener('input', (e) => {
            document.getElementById('speed-boost-value').textContent = e.target.value;
            this.settings.speedBoost = parseFloat(e.target.value);
            this.debouncedSave();
        });

        // URL input with validation and auto-save
        const urlInput = document.getElementById('api-url');
        urlInput.addEventListener('input', (e) => {
            this.validateUrl(e);
            if (this.isValidUrl(e.target.value.trim())) {
                this.settings.apiUrl = e.target.value.trim();
                this.debouncedSave();
            }
        });

        // Voice selection auto-save
        const voiceSelect = document.getElementById('voice');
        voiceSelect.addEventListener('change', (e) => {
            this.settings.voice = e.target.value;
            this.saveSettings();
        });

        // Checkbox auto-save
        const autoHighlightCheckbox = document.getElementById('auto-highlight');
        const skipDuplicatesCheckbox = document.getElementById('skip-duplicates');
        const showButtonCheckbox = document.getElementById('show-button');
        
        autoHighlightCheckbox.addEventListener('change', (e) => {
            this.settings.autoHighlight = e.target.checked;
            this.saveSettings();
        });
        
        skipDuplicatesCheckbox.addEventListener('change', (e) => {
            this.settings.skipDuplicates = e.target.checked;
            this.saveSettings();
        });

        showButtonCheckbox.addEventListener('change', (e) => {
            this.settings.showButton = e.target.checked;
            this.saveSettings();
        });

        // Keybind input
        const keybindInput = document.getElementById('keybind');
        keybindInput.addEventListener('click', (e) => {
            this.captureKeybind(e.target);
        });
    }

    // Debounced save for text inputs and ranges to avoid too frequent saves
    debouncedSave() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveSettings();
        }, 500);
    }

    captureKeybind(input) {
        input.value = 'Press keys...';
        input.style.background = '#e3f2fd';
        
        const handleKeyDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const keys = [];
            if (e.ctrlKey) keys.push('ctrl');
            if (e.altKey) keys.push('alt');
            if (e.shiftKey) keys.push('shift');
            if (e.metaKey) keys.push('meta');
            
            // Don't capture modifier keys alone
            if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
                keys.push(e.key.toLowerCase());
                
                const keybind = keys.join('+');
                this.settings.keybind = keybind;
                input.value = keybind;
                input.style.background = '';
                
                document.removeEventListener('keydown', handleKeyDown, true);
                this.saveSettings();
            }
        };
        
        document.addEventListener('keydown', handleKeyDown, true);
        
        // Cancel capture if input loses focus
        input.addEventListener('blur', () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            input.value = this.settings.keybind;
            input.style.background = '';
        }, { once: true });
    }

    updateUI() {
        // Populate form with current settings
        document.getElementById('api-url').value = this.settings.apiUrl;
        document.getElementById('voice').value = this.settings.voice;
        document.getElementById('speed').value = this.settings.speed;
        document.getElementById('speed-boost').value = this.settings.speedBoost;
        document.getElementById('auto-highlight').checked = this.settings.autoHighlight;
        document.getElementById('skip-duplicates').checked = this.settings.skipDuplicates;
        document.getElementById('show-button').checked = this.settings.showButton;
        document.getElementById('keybind').value = this.settings.keybind;

        // Update range value displays
        document.getElementById('speed-value').textContent = this.settings.speed;
        document.getElementById('speed-boost-value').textContent = this.settings.speedBoost;
    }

    validateUrl(event) {
        const input = event.target;
        const url = input.value.trim();
        
        if (url && !this.isValidUrl(url)) {
            input.setCustomValidity('Please enter a valid URL (e.g., http://localhost:8000)');
        } else {
            input.setCustomValidity('');
        }
    }

    isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }



    async resetToDefaults() {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            this.settings = { ...DEFAULT_SETTINGS };
            this.updateUI();
            await this.saveSettings();
            this.showMessage('Settings reset to defaults!', 'success');
            this.checkConnection();
        }
    }

    async testConnection() {
        const button = document.getElementById('test-connection');
        const originalText = button.textContent;
        
        button.textContent = 'Testing...';
        button.disabled = true;
        
        try {
            const response = await fetch(`${this.settings.apiUrl}/health`, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                this.updateConnectionStatus('connected', 'Server connected successfully');
                this.showMessage('Connection test successful!', 'success');
            } else {
                throw new Error(`Server responded with status: ${response.status}`);
            }
        } catch (error) {
            console.error('Connection test failed:', error);
            this.updateConnectionStatus('disconnected', 'Connection failed');
            this.showMessage(`Connection failed: ${error.message}`, 'error');
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    async checkConnection() {
        this.updateConnectionStatus('checking', 'Checking connection...');
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(`${this.settings.apiUrl}/health`, {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                this.updateConnectionStatus('connected', 'Server connected');
            } else {
                this.updateConnectionStatus('disconnected', 'Server not responding');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                this.updateConnectionStatus('disconnected', 'Connection timeout');
            } else {
                this.updateConnectionStatus('disconnected', 'Connection failed');
            }
        }
    }

    updateConnectionStatus(status, message) {
        const dot = document.querySelector('.status-dot');
        const text = document.getElementById('connection-text');
        
        // Remove existing status classes
        dot.classList.remove('connected', 'disconnected');
        
        if (status === 'connected') {
            dot.classList.add('connected');
        } else if (status === 'disconnected') {
            dot.classList.add('disconnected');
        }
        // 'checking' status uses the default pulsing animation
        
        text.textContent = message;
    }

    showMessage(message, type) {
        // Remove existing message
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create new message
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type} show`;
        messageEl.textContent = message;

        // Insert at the top of the form
        const form = document.getElementById('settings-form');
        form.insertBefore(messageEl, form.firstChild);

        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.classList.remove('show');
                setTimeout(() => {
                    if (messageEl.parentNode) {
                        messageEl.remove();
                    }
                }, 300);
            }
        }, 3000);
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});

// Handle messages from content scripts (if needed)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SETTINGS') {
        browser.storage.local.get('ttsSettings').then(result => {
            const settings = { ...DEFAULT_SETTINGS, ...(result.ttsSettings || {}) };
            sendResponse(settings);
        });
        return true; // Keep message channel open for async response
    }
}); 