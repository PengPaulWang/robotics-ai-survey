// Update your frontend/js/config.js for production
const CONFIG = {
    API_BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5001'  // Development
        : 'https://your-backend-app.railway.app',  // Production - Update this URL
    VERSION: '1.0.0',
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    AUTO_SAVE_INTERVAL: 30000,
    DEBUG: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
};

// Debug logging
if (CONFIG.DEBUG) {
    console.log('Configuration loaded:', CONFIG);
    console.log('Environment:', window.location.hostname);
}

// Add error tracking (optional)
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    // You can send this to an error tracking service like Sentry
});

// Add network status detection
window.addEventListener('online', function() {
    console.log('Connection restored');
    if (typeof showNetworkStatus === 'function') {
        showNetworkStatus('Connection restored', 'success');
    }
});

window.addEventListener('offline', function() {
    console.log('Connection lost');
    if (typeof showNetworkStatus === 'function') {
        showNetworkStatus('Working offline - data will sync when connection returns', 'warning');
    }
});