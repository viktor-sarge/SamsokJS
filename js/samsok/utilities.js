// Trim and trimLeft may not be available on MSIE - add them in that case

if(typeof String.prototype.trim !== 'function') {
    String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, '');
    }
}

if(typeof String.prototype.trimLeft !== 'function') {
    String.prototype.trimLeft = function() {
        return this.replace(/^\s+/, '');
    }
}

function isNumeric(x) {
    return !isNaN(parseFloat(x)) && isFinite(x)
}

// `window` is not available inside web workers, so fall back to whichever
// global-like object we can find without ever touching an undefined binding.
var _global = (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof self !== 'undefined' && self) ||
    (typeof window !== 'undefined' && window) ||
    (typeof global !== 'undefined' && global) ||
    {};

_global.SamsokUtilities = _global.SamsokUtilities || {};

var SamsokUtilities = _global.SamsokUtilities;

SamsokUtilities.buildGotlibProxyUrl = function(url) {
    if (!url) {
        return url;
    }

    var proxyBase = (location.protocol === 'https:' ? 'https:' : 'http:') + '//samsokproxy.appspot.com/gotlib/proxy?url=';

    if (url.indexOf('samsokproxy.appspot.com/gotlib/proxy') >= 0) {
        return url;
    }

    return proxyBase + encodeURIComponent(url);
};
