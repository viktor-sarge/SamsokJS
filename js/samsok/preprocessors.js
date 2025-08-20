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
    
    // Check for cookie challenge page
    if (content.indexOf('function leastFactor(n)') !== -1 && 
        content.indexOf('document.cookie=') !== -1 &&
        content.indexOf('document.location.reload(true)') !== -1) {
        
        // Check if we've exceeded maximum challenge attempts
        if (challengeAttempts >= MAX_CHALLENGE_ATTEMPTS) {
            func("");
            return;
        }
        
        // Execute the challenge page JavaScript in an isolated context
        try {
            // Extract the entire script content
            var scriptMatch = content.match(/<script[^>]*><!--([\s\S]*?)\/\/--><\/script>/);
            if (!scriptMatch) {
                func("");
                return;
            }
            
            var scriptContent = scriptMatch[1];
            
            // Create a sandboxed environment that intercepts cookie setting
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
            
            // Create the execution environment
            var sandboxedCode = 
                scriptContent + '\n' +
                'if (typeof go === "function") { go(); }\n' +
                'return true;';
            
            // Replace document references with our mock
            sandboxedCode = sandboxedCode.replace(/document\./g, 'mockDocument.');
            
            // Execute with our mock document in scope
            var executionCode = 
                'var mockDocument = this.mockDocument;\n' +
                sandboxedCode;
            
            
            try {
                var sandboxFunc = new Function('mockDocument', sandboxedCode);
                sandboxFunc.call({ mockDocument: mockDocument }, mockDocument);
            } catch (e) {
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