/**
 * ============================================================
 * BRIDGE.JS - DragonBall HTML5 Standalone Bridge
 * ============================================================
 * 
 * Purpose: Override egret.ExternalInterface untuk komunikasi
 * antara game dan SDK lokal tanpa native wrapper.
 * 
 * Load Order: AFTER egret.web.min.js
 * 
 * Author: Local SDK Bridge
 * Version: 1.1.0
 * ============================================================
 */

(function() {
    'use strict';

        // ========================================================
    // 1. STYLISH LOGGER - FIXED VERSION
    // ========================================================
    var LOG = {
        prefix: '🎮 [BRIDGE]',
        styles: {
            title: 'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
            success: 'color: #10b981; font-weight: bold;',
            info: 'color: #3b82f6;',
            warn: 'color: #f59e0b; font-weight: bold;',
            error: 'color: #ef4444; font-weight: bold;',
            data: 'color: #8b5cf6;',
            separator: 'color: #6b7280;'
        },
        
        _formatTime: function() {
            return new Date().toISOString().substr(11, 12);
        },
        
        _log: function(level, icon, message, data) {
            var timestamp = this._formatTime();
            var style = this.styles[level] || this.styles.info;
            
            // Format: %c[Prefix] %c[Timestamp + Icon + Message]
            var format = '%c' + this.prefix + ' %c[' + timestamp + '] ' + icon + ' ' + message;
            
            if (data !== undefined) {
                console.log(format, this.styles.title, style, data);
            } else {
                console.log(format, this.styles.title, style);
            }
        },
        
        title: function(message) {
            var line = '══════════════════════════════════════════════════════';
            // Gunakan dua %c agar garis tidak ikut masuk ke kotak judul
            console.log('%c' + this.prefix + '%c ' + line, this.styles.title, this.styles.separator);
            console.log('%c' + this.prefix + '%c ' + message, this.styles.title, this.styles.title);
            console.log('%c' + this.prefix + '%c ' + line, this.styles.title, this.styles.separator);
        },
        
        success: function(message, data) { this._log('success', '✅', message, data); },
        info: function(message, data) { this._log('info', 'ℹ️', message, data); },
        warn: function(message, data) { this._log('warn', '⚠️', message, data); },
        error: function(message, data) { this._log('error', '❌', message, data); },
        data: function(message, data) { this._log('data', '📦', message, data); },
        
        call: function(name, message) {
            this._log('info', '📞', 'call("' + name + '", "' + message + '")');
        },
        
        callback: function(name, data) { 
            this._log('success', '🔔', 'Callback triggered: ' + name);
            if (data) {
                // Perbaikan log Response Data agar tidak bocor
                console.log('%c' + this.prefix + ' %c📤 Response Data:', this.styles.title, this.styles.data, data);
            }
        },
        
        separator: function() {
            console.log('%c' + this.prefix + '%c ────────────────────────────────────────────────────────', this.styles.title, this.styles.separator);
        }
    };


    // ========================================================
    // 2. CALLBACK STORAGE
    // ========================================================
    var _callbacks = {};
    
    // Track pending calls for delayed response
    var _pendingCalls = {};
    
    // Track initialization state
    var _state = {
        initialized: false,
        startGameTriggered: false,
        callbackCount: 0,
        callCount: 0
    };

    // ========================================================
    // 3. CHECK EGRET AVAILABILITY
    // ========================================================
    if (typeof egret === 'undefined') {
        console.error('🎮 [BRIDGE] ❌ FATAL: egret object not found!');
        console.error('🎮 [BRIDGE] Make sure bridge.js is loaded AFTER egret.web.min.js');
        return;
    }
    
    if (!egret.ExternalInterface) {
        console.error('🎮 [BRIDGE] ❌ FATAL: egret.ExternalInterface not found!');
        return;
    }

    // ========================================================
    // 4. STORE ORIGINAL REFERENCES (for debugging)
    // ========================================================
    var _originalCall = egret.ExternalInterface.call;
    var _originalAddCallback = egret.ExternalInterface.addCallback;
    
    LOG.title('Bridge Initializing...');
    LOG.info('Original call: function');
    LOG.info('Original addCallback: function');

    // ========================================================
    // 5. OVERRIDE addCallback
    // ========================================================
    egret.ExternalInterface.addCallback = function(name, callback) {
        _state.callbackCount++;
        var callbackId = _state.callbackCount;
        
        LOG.info('📌 addCallback("' + name + '") [ID: ' + callbackId + ']');
        
        if (typeof callback !== 'function') {
            LOG.error('Callback is not a function!', typeof callback);
            return;
        }
        
        // Store the callback
        _callbacks[name] = {
            fn: callback,
            id: callbackId,
            registeredAt: new Date().toISOString()
        };
        
        LOG.success('Callback registered: "' + name + '" [Total: ' + Object.keys(_callbacks).length + ']');
        
        // Check if there's a pending call waiting for this callback
        if (_pendingCalls[name]) {
            LOG.info('🔄 Found pending call for "' + name + '", triggering now...');
            _triggerCallback(name, _pendingCalls[name].message);
            delete _pendingCalls[name];
        }
    };

    // ========================================================
    // 6. HELPER: Trigger Callback
    // ========================================================
    function _triggerCallback(name, message) {
        LOG.info('🎯 _triggerCallback("' + name + '", ...)');
        
        var callbackObj = _callbacks[name];
        if (!callbackObj) {
            LOG.error('No callback registered for: "' + name + '"');
            return false;
        }
        
        var callback = callbackObj.fn;
        if (typeof callback !== 'function') {
            LOG.error('Callback for "' + name + '" is not a function!');
            return false;
        }
        
        try {
            LOG.callback(name, message);
            callback(message);
            return true;
        } catch (e) {
            LOG.error('Error executing callback "' + name + '":', e);
            console.error(e);
            return false;
        }
    }

    // ========================================================
    // 7. HELPER: Get SDK Data
    // ========================================================
    function _getSDKData() {
        if (typeof window.LOCAL_SDK === 'undefined') {
            LOG.error('window.LOCAL_SDK not found! Make sure sdk.js is loaded before bridge.js');
            return null;
        }
        
        if (typeof window.LOCAL_SDK.getStartGameData !== 'function') {
            LOG.error('window.LOCAL_SDK.getStartGameData is not a function!');
            return null;
        }
        
        return window.LOCAL_SDK.getStartGameData();
    }

    // ========================================================
    // 8. OVERRIDE call - Main Handler
    // ========================================================
    egret.ExternalInterface.call = function(name, message) {
        _state.callCount++;
        var callId = _state.callCount;
        
        LOG.title('Call #' + callId + ': ' + name);
        LOG.call(name, message);
        LOG.info('Message: "' + message + '"');
        
        // Route to appropriate handler
        switch (name) {
            
            // ================================================
            // startGame - THE MOST CRITICAL ONE
            // ================================================
            case 'startGame':
                LOG.info('🎮 startGame called - Game is requesting SDK data...');
                
                if (_state.startGameTriggered) {
                    LOG.warn('startGame already triggered! Skipping duplicate call.');
                    return;
                }
                _state.startGameTriggered = true;
                
                // Check if callback is already registered
                if (_callbacks['startGame']) {
                    LOG.info('✓ Callback already registered, scheduling response...');
                    
                    // Get data from LOCAL_SDK
                    var startGameData = _getSDKData();
                    if (!startGameData) {
                        LOG.error('Failed to get startGame data from SDK!');
                        return;
                    }
                    
                    LOG.data('StartGame Data:', startGameData);
                    
                    // Trigger with delay to ensure everything is ready
                    var delay = 100;
                    LOG.info('⏱️ Scheduling callback in ' + delay + 'ms...');
                    
                    setTimeout(function() {
                        LOG.title('Triggering startGame Callback');
                        var responseJson = JSON.stringify(startGameData);
                        LOG.data('Response JSON:', responseJson);
                        _triggerCallback('startGame', responseJson);
                        LOG.success('🚀 Game should start now!');
                    }, delay);
                    
                } else {
                    // Callback not registered yet, store as pending
                    LOG.warn('Callback not registered yet, storing as pending...');
                    _pendingCalls['startGame'] = {
                        message: message,
                        timestamp: new Date().toISOString()
                    };
                    
                    // Wait for addCallback then trigger
                    var checkInterval = setInterval(function() {
                        if (_callbacks['startGame']) {
                            clearInterval(checkInterval);
                            LOG.info('✓ Callback now registered, triggering...');
                            
                            var startGameData = _getSDKData();
                            if (startGameData) {
                                setTimeout(function() {
                                    _triggerCallback('startGame', JSON.stringify(startGameData));
                                    LOG.success('🚀 Game should start now!');
                                }, 100);
                            }
                        }
                    }, 50);
                    
                    // Timeout after 5 seconds
                    setTimeout(function() {
                        if (_pendingCalls['startGame']) {
                            clearInterval(checkInterval);
                            LOG.error('⏰ Timeout waiting for startGame callback registration!');
                        }
                    }, 5000);
                }
                break;
                
            // ================================================
            // refresh - Page Reload / User Switch
            // ================================================
            case 'refresh':
                LOG.info('🔄 refresh called with message: "' + message + '"');
                
                if (message === 'refresh' || message === 'reload game') {
                    LOG.info('📋 Action: Page reload requested');
                    if (_callbacks['refresh']) {
                        _triggerCallback('refresh', message);
                    } else {
                        LOG.warn('No refresh callback, direct reload...');
                        setTimeout(function() {
                            window.location.reload();
                        }, 100);
                    }
                } else if (message === 'switch usr') {
                    LOG.info('👤 Action: User switch requested');
                    if (typeof window.LOCAL_SDK !== 'undefined' && window.LOCAL_SDK.switchUser) {
                        window.LOCAL_SDK.switchUser();
                    }
                    setTimeout(function() {
                        window.location.reload();
                    }, 100);
                } else {
                    LOG.info('📋 Unknown refresh message: "' + message + '"');
                }
                break;
                
            // ================================================
            // changeView - View Change Notification
            // ================================================
            case 'changeView':
                LOG.info('👁️ changeView: "' + message + '"');
                LOG.info('📋 Action: View change logged (no response needed)');
                break;
                
            // ================================================
            // pei - Payment
            // ================================================
            case 'pei':
                LOG.info('💰 pei (Payment) called');
                try {
                    var paymentData = JSON.parse(message);
                    LOG.data('Payment Data:', paymentData);
                    LOG.warn('⚠️ Payment in standalone mode - bypassed');
                } catch (e) {
                    LOG.error('Failed to parse payment data:', e);
                }
                break;
                
            // ================================================
            // giveLike - Facebook Share/Like
            // ================================================
            case 'giveLike':
                LOG.info('👍 giveLike (Share) called');
                try {
                    var shareData = JSON.parse(message);
                    LOG.data('Share Data:', shareData);
                    LOG.warn('⚠️ Share in standalone mode - bypassed');
                } catch (e) {
                    LOG.error('Failed to parse share data:', e);
                }
                break;
                
            // ================================================
            // contact - Customer Service
            // ================================================
            case 'contact':
                LOG.info('📞 contact (Customer Service) called');
                LOG.warn('⚠️ Customer service not available in standalone mode');
                break;
                
            // ================================================
            // switchAccount - Account Switch
            // ================================================
            case 'switchAccount':
                LOG.info('🔄 switchAccount called');
                LOG.info('📋 Action: Account switch - will reload page');
                if (typeof window.LOCAL_SDK !== 'undefined' && window.LOCAL_SDK.switchUser) {
                    window.LOCAL_SDK.switchUser();
                }
                setTimeout(function() {
                    window.location.reload();
                }, 100);
                break;
                
            // ================================================
            // fbGiveLive - Facebook Like
            // ================================================
            case 'fbGiveLive':
                LOG.info('👍 fbGiveLive (FB Like) called');
                LOG.warn('⚠️ Facebook like not available in standalone mode');
                break;
                
            // ================================================
            // userCenter - User Center
            // ================================================
            case 'userCenter':
                LOG.info('👤 userCenter called');
                LOG.warn('⚠️ User center not available in standalone mode');
                break;
                
            // ================================================
            // gifBag - Gift Bag
            // ================================================
            case 'gifBag':
                LOG.info('🎁 gifBag (Gift) called');
                LOG.warn('⚠️ Gift bag not available in standalone mode');
                break;
                
            // ================================================
            // report2Third - Analytics Report
            // ================================================
            case 'report2Third':
                LOG.info('📊 report2Third (Analytics) called');
                try {
                    var reportData = JSON.parse(message);
                    LOG.data('Report Data:', reportData);
                    LOG.info('📋 Analytics logged (no server to send to)');
                } catch (e) {
                    LOG.error('Failed to parse report data:', e);
                }
                break;
                
            // ================================================
            // changeLanguage - Language Change
            // ================================================
            case 'changeLanguage':
                LOG.info('🌐 changeLanguage: "' + message + '"');
                LOG.info('📋 Language change requested to: ' + message);
                break;
                
            // ================================================
            // openURL - Open URL
            // ================================================
            case 'openURL':
                LOG.info('🔗 openURL: "' + message + '"');
                if (message) {
                    LOG.info('📋 Opening URL in new tab: ' + message);
                    try {
                        window.open(message, '_blank');
                        LOG.success('URL opened successfully');
                    } catch (e) {
                        LOG.error('Failed to open URL:', e);
                    }
                } else {
                    LOG.warn('No URL provided');
                }
                break;
                
            // ================================================
            // Unknown Handler
            // ================================================
            default:
                LOG.warn('❓ Unknown call: "' + name + '" with message: "' + message + '"');
                LOG.info('📋 This call has no handler and will be ignored');
        }
        
        LOG.separator();
    };

    // ========================================================
    // 9. MARK INITIALIZED
    // ========================================================
    _state.initialized = true;
    
    LOG.title('Bridge Initialized Successfully!');
    LOG.success('Total functions overridden: 2');
    LOG.info('• egret.ExternalInterface.call → Custom handler');
    LOG.info('• egret.ExternalInterface.addCallback → Custom handler');
    LOG.info('');
    LOG.info('Ready to handle game communication! 🚀');

    // ========================================================
    // 10. EXPOSE DEBUG INFO (for console inspection)
    // ========================================================
    window.BRIDGE_DEBUG = {
        state: _state,
        callbacks: _callbacks,
        pendingCalls: _pendingCalls,
        triggerCallback: _triggerCallback,
        getSDKData: _getSDKData,
        logState: function() {
            console.log('%c🎮 [BRIDGE] Current State:', 'font-weight: bold; color: #667eea;', {
                initialized: _state.initialized,
                startGameTriggered: _state.startGameTriggered,
                callbackCount: _state.callbackCount,
                callCount: _state.callCount,
                registeredCallbacks: Object.keys(_callbacks),
                pendingCalls: Object.keys(_pendingCalls)
            });
        }
    };
    
    LOG.info('💡 Debug: Use BRIDGE_DEBUG.logState() in console');

})();
