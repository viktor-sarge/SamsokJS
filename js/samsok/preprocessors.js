// This file contains preprocessors. They are run on content before the actual parsing begins, to perform
// any preprocessing needed, such as transforming data or following redirects.
// The preprocessor must then execute the supplied function which triggers parsing (this is to enable
// the preprocessors to work asynchronously).

// Many Arena libraries will use a Javascript redirect to go directly to the book page if there's only one hit.
// This preprocessor will detect and follow that redirect.
// It also handles cookie challenge pages that require JavaScript execution.
var ArenaPreprocessor = function(provider, content, func, cookies, searchUrl, challengeAttempts) {
    // For backwards compatibility, searchUrl may not be provided
    if (!searchUrl) {
        // Try to construct one using the provider's baseUrl - this is a fallback
        searchUrl = provider.get('searchUrl') || provider.get('baseUrl') || '';
    }
    
    challengeAttempts = challengeAttempts || 0;
    var MAX_CHALLENGE_ATTEMPTS = 10;
    
    // Check for cookie challenge page using more flexible pattern matching
    if (content.indexOf('function leastFactor(n)') !== -1 && 
        /document\.cookie\s*=/i.test(content) &&
        /document\.location\.reload\s*\(/i.test(content)) {
        
        // Check if we've exceeded maximum challenge attempts
        if (challengeAttempts >= MAX_CHALLENGE_ATTEMPTS) {
            func("");
            return;
        }
        
        // Execute the challenge page JavaScript in a secure sandboxed context
        try {
            // Extract the entire script content
            var scriptMatch = content.match(/<script[^>]*><!--([\s\S]*?)\/\/--><\/script>/);
            if (!scriptMatch) {
                func("");
                return;
            }
            
            var scriptContent = scriptMatch[1];
            
            // Security validation: Check for suspicious patterns
            var dangerousPatterns = [
                /fetch\s*\(/i,
                /XMLHttpRequest/i,
                /eval\s*\(/i,
                /Function\s*\(/i,
                /setTimeout/i,
                /setInterval/i,
                /localStorage/i,
                /sessionStorage/i,
                /window\s*\[/i,
                /document\s*\[/i,
                /location\s*\[/i,
                /this\s*\./i,
                /arguments/i,
                /constructor/i,
                /__proto__/i,
                /prototype/i
            ];
            
            for (var i = 0; i < dangerousPatterns.length; i++) {
                if (dangerousPatterns[i].test(scriptContent)) {
                    // Security violation detected - reject the script
                    func("");
                    return;
                }
            }
            
            // Create a heavily restricted sandboxed environment
            var capturedCookie = null;
            var mockDocument = {
                cookie: "",
                location: {
                    reload: function() { /* no-op */ }
                }
            };
            
            // Define a setter to capture the cookie value
            Object.defineProperty(mockDocument, 'cookie', {
                set: function(value) {
                    capturedCookie = value;
                },
                get: function() {
                    return "";
                }
            });
            
            // Create restricted global context - override dangerous globals but preserve Math, Date etc.
            var restrictedCode = '';
            var dangersToOverride = [
                'window', 'document', 'location', 'console', 'alert', 'confirm', 'prompt',
                'eval', 'Function', 'setTimeout', 'setInterval', 'fetch', 'XMLHttpRequest',
                'localStorage', 'sessionStorage', 'history', 'navigator', 'screen',
                'parent', 'top', 'frames', 'self', 'global', 'globalThis'
            ];
            
            // Override dangerous globals
            for (var i = 0; i < dangersToOverride.length; i++) {
                restrictedCode += 'var ' + dangersToOverride[i] + ' = undefined;\n';
            }
            
            // Provide safe Math and Date objects (needed for legitimate challenges)
            restrictedCode += 'var Math = arguments[1];\n';
            restrictedCode += 'var Date = arguments[2];\n';
            restrictedCode += 'var mockDocument = arguments[0];\n';
            restrictedCode += scriptContent.replace(/document\./g, 'mockDocument.') + '\n';
            restrictedCode += 'if (typeof go === "function") { go(); }\n';
            
            // Execute with timeout protection
            var executionStartTime = Date.now();
            var timeoutMs = 5000; // 5 second timeout
            
            try {
                var sandboxFunc = new Function(restrictedCode);
                
                // Check for timeout during execution
                var originalDate = Date.now;
                Date.now = function() {
                    if (originalDate() - executionStartTime > timeoutMs) {
                        throw new Error("Execution timeout");
                    }
                    return originalDate();
                };
                
                // Execute with safe Math and Date objects passed as arguments
                sandboxFunc.call(null, mockDocument, Math, Date);
                
                // Restore Date.now
                Date.now = originalDate;
                
            } catch (e) {
                // Restore Date.now in case of error
                if (Date.now !== originalDate) {
                    Date.now = originalDate;
                }
                // Even if there's an error, check if we captured a cookie
            }
            
            // Check if we captured a cookie
            if (!capturedCookie) {
                func("");
                return;
            }
            
            
            var cookieValue = capturedCookie;
            if (capturedCookie.indexOf('=') !== -1) {
                cookieValue = capturedCookie.split(';')[0];
            }
            
            
            // For Arena challenges, use ONLY the challenge cookie (like browsers do)
            // Existing cookies can interfere with challenge validation
            var newCookies = cookieValue;
            
            var retryUrl = searchUrl;
            
            if (!retryUrl) {
                func("");
                return;
            }
            
            // Ensure proxyBaseUrl is available (it's defined in searcher.js but may not be global)
            if (typeof proxyBaseUrl === 'undefined') {
                if (typeof window !== 'undefined' && window.proxyBaseUrl) {
                    var proxyBaseUrl = window.proxyBaseUrl;
                } else {
                    var proxyBaseUrl = (location.protocol == 'https:' ? 'https:' : 'http:') + "//samsokproxy.appspot.com/crossdomain";
                }
            }
            
            $.getJSON(proxyBaseUrl + "?url=" +
                    encodeURIComponent(retryUrl) +
                    "&encoding=" + provider.get('encoding') +
                    "&cookies=" + encodeURIComponent(newCookies) +
                    "&callback=?"
            ).done(function(data) {
                
                if (!data.content) {
                    func("");
                    return;
                }
                
                if (data.content.indexOf('function leastFactor(n)') !== -1) {
                    // Recursively handle the new challenge with incremented attempts
                    ArenaPreprocessor(provider, data.content, func, data.cookies || newCookies, retryUrl, challengeAttempts + 1);
                    return;
                }
                
                // Process the actual content (may contain redirects) - don't increment challengeAttempts for non-challenge content
                ArenaPreprocessor(provider, data.content, func, newCookies, retryUrl, 0);
            }).fail(function(jqXHR, textStatus, errorThrown) {
                func("");
            });
            return;
        } catch (e) {
            func("");
            return;
        }
    }
    
    // Original redirect detection logic
    var regex = /jQuery\(function\(.*?\)\{.*?\(document\)\.ready\(function\(\)\{location\.replace\("(.*?)"\)\}\)\}\)/g;
    var match = regex.exec(content);
    if (match) {
        var newUrl = encodeURI(decodeURIComponent(match[1].replace(/\\x/g, '%')));
        $.getJSON(proxyBaseUrl + "?url=" +
                encodeURIComponent(newUrl) +
                "&encoding=" + provider.get('encoding') +
                "&cookies=" + cookies +
                "&callback=?"
        ).done(function(data) {
            if (!data.content) {
                throw "Error getting page";
            }
            
            // Process the redirected content (may contain challenges) - reset challengeAttempts for redirects
            ArenaPreprocessor(provider, data.content, func, cookies, newUrl, 0);
        });
    } else {
        func(content);
    }
};

var BlockPhrasePreprocessorGenerator = function(phrase) {
    return function(provider, content, func) {
        if (content.indexOf(phrase) >= 0) {
            func("");
        } else {
            func(content);
        }
    };
};