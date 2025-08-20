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

// Koha libraries may use BotStopper which requires solving a Proof-of-Work challenge
var KohaPreprocessor = function(provider, content, func, cookies, searchUrl, challengeAttempts) {
    challengeAttempts = challengeAttempts || 0;
    var MAX_CHALLENGE_ATTEMPTS = 3;
    
    // Check for Koha fast_challenge page (bot detection type)
    if (content.indexOf('koha_fast_challenge') !== -1 && 
        content.indexOf('loading-overlay') !== -1) {
        
        console.log("Koha fast_challenge detected for " + provider.get('name'));
        
        // This challenge checks for bot characteristics and sets a KOHA_INIT cookie
        // The script waits for a timeout based on detected bot indicators, then sets the cookie
        // We can bypass this by directly setting the required cookie
        
        // Set the KOHA_INIT cookie that the challenge would set
        // Important: Don't include SameSite=Lax as the proxy doesn't handle it well
        var challengeCookie = 'KOHA_INIT=1';
        
        // The proxy can handle cookies in two formats:
        // 1. Base64-encoded pickled format (what it returns from responses)  
        // 2. Plain cookie strings (what we can send)
        
        // For the koha_fast_challenge, we just need KOHA_INIT=1
        // We can't easily merge with pickled cookies, but the test showed
        // that KOHA_INIT=1 alone is sufficient to bypass the challenge
        var newCookies = challengeCookie;
        
        console.log("Setting KOHA_INIT cookie and retrying...");
        
        // Retry immediately with the KOHA_INIT cookie
        if (typeof proxyBaseUrl === 'undefined') {
            if (typeof window !== 'undefined' && window.proxyBaseUrl) {
                var proxyBaseUrl = window.proxyBaseUrl;
            } else {
                var proxyBaseUrl = (location.protocol == 'https:' ? 'https:' : 'http:') + "//samsokproxy.appspot.com/crossdomain";
            }
        }
        
        var retryUrl = searchUrl || provider.get('searchUrl');
        
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
            
            // Check if we still get a challenge page
            if (data.content.indexOf('koha_fast_challenge') !== -1) {
                if (challengeAttempts >= MAX_CHALLENGE_ATTEMPTS) {
                    console.log("Max Koha fast_challenge attempts reached");
                    func("");
                    return;
                }
                // Try again with incremented attempts
                KohaPreprocessor(provider, data.content, func, newCookies, retryUrl, challengeAttempts + 1);
                return;
            }
            
            // Success! Pass the content to the parser
            func(data.content);
        }).fail(function() {
            func("");
        });
        
        return;
    }
    
    // Check if this is a BotStopper challenge page (Anubis type)
    if (content.indexOf('BotStopper') !== -1 && 
        content.indexOf('anubis_challenge') !== -1 &&
        content.indexOf('Ensuring the security of your connection') !== -1) {
        
        // Check if we've exceeded maximum challenge attempts
        if (challengeAttempts >= MAX_CHALLENGE_ATTEMPTS) {
            console.log("Max BotStopper challenge attempts reached for " + provider.get('name'));
            func("");
            return;
        }
        
        // Extract the challenge data
        var challengeMatch = content.match(/<script id="anubis_challenge"[^>]*>(.*?)<\/script>/s);
        if (!challengeMatch) {
            func("");
            return;
        }
        
        try {
            var challengeData = JSON.parse(challengeMatch[1]);
            var challenge = challengeData.challenge;
            var difficulty = challengeData.rules.difficulty;
            var algorithm = challengeData.rules.algorithm;
            
            console.log("BotStopper challenge detected for " + provider.get('name'));
            console.log("Challenge: " + challenge + ", Difficulty: " + difficulty + ", Algorithm: " + algorithm);
            
            // Check if browser supports WebCrypto API for SHA-256
            if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
                // Use browser's native SHA-256
                var sha256 = async function(message) {
                    var msgBuffer = new TextEncoder().encode(message);
                    var hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                    var hashArray = Array.from(new Uint8Array(hashBuffer));
                    var hashHex = hashArray.map(function(b) { 
                        return b.toString(16).padStart(2, '0'); 
                    }).join('');
                    return hashHex;
                };
                
                // Solve the BotStopper challenge asynchronously
                var solveChallenge = async function() {
                    var maxAttempts = 500000; // Higher limit for real SHA-256
                    
                    for (var nonce = 0; nonce < maxAttempts; nonce++) {
                        var attempt = challenge + nonce;
                        var hash = await sha256(attempt);
                        var hashBytes = [];
                        
                        // Convert hex string to byte array
                        for (var i = 0; i < hash.length; i += 2) {
                            hashBytes.push(parseInt(hash.substr(i, 2), 16));
                        }
                        
                        // Check if hash meets difficulty requirement
                        // For "fast" algorithm, check nibbles (half-bytes)
                        var valid = true;
                        for (var h = 0; h < difficulty; h++) {
                            var byteIndex = Math.floor(h / 2);
                            var nibbleIndex = h % 2;
                            var nibbleValue = (hashBytes[byteIndex] >> (nibbleIndex === 0 ? 4 : 0)) & 0x0F;
                            
                            if (nibbleValue !== 0) {
                                valid = false;
                                break;
                            }
                        }
                        
                        if (valid) {
                            console.log("Found valid hash: " + hash + " with nonce: " + nonce);
                            return { nonce: nonce, hash: hash };
                        }
                        
                        // Log progress every 10000 attempts
                        if (nonce % 10000 === 0) {
                            console.log("BotStopper solving progress: " + nonce + " attempts");
                        }
                    }
                    
                    return null;
                };
                
                // Execute the async solver
                solveChallenge().then(function(solution) {
                    if (!solution) {
                        console.log("Could not solve BotStopper challenge");
                        func("");
                        return;
                    }
                    
                    console.log("BotStopper challenge solved with nonce: " + solution.nonce);
                    
                    // BotStopper submits the solution via a redirect to pass-challenge endpoint
                    // We need to get the redirect URL with the solution
                    var baseUrl = provider.get('baseUrl') || '';
                    if (baseUrl && !baseUrl.endsWith('/')) {
                        baseUrl += '/';
                    }
                    
                    // Construct the pass-challenge URL as BotStopper does
                    var passChallengePath = '.within.website/x/cmd/anubis/api/pass-challenge';
                    var passChallengeUrl = baseUrl + passChallengePath + 
                        '?response=' + encodeURIComponent(solution.hash) +
                        '&nonce=' + solution.nonce +
                        '&redir=' + encodeURIComponent(searchUrl || provider.get('searchUrl')) +
                        '&elapsedTime=1000'; // Fake elapsed time
                    
                    // Request the pass-challenge URL to get the cookie
                    if (typeof proxyBaseUrl === 'undefined') {
                        if (typeof window !== 'undefined' && window.proxyBaseUrl) {
                            var proxyBaseUrl = window.proxyBaseUrl;
                        } else {
                            var proxyBaseUrl = (location.protocol == 'https:' ? 'https:' : 'http:') + "//samsokproxy.appspot.com/crossdomain";
                        }
                    }
                    
                    $.getJSON(proxyBaseUrl + "?url=" +
                            encodeURIComponent(passChallengeUrl) +
                            "&encoding=" + provider.get('encoding') +
                            "&cookies=" + encodeURIComponent(cookies || '') +
                            "&callback=?"
                    ).done(function(passData) {
                        // The pass-challenge endpoint should set a cookie and redirect
                        // Use the cookies from the response
                        var newCookies = passData.cookies || cookies;
                        
                        // Now retry the original search URL with the new cookies
                        var retryUrl = searchUrl || provider.get('searchUrl');
                        
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
                            
                            // Check if we still get a BotStopper challenge
                            if (data.content.indexOf('BotStopper') !== -1 && 
                                data.content.indexOf('anubis_challenge') !== -1) {
                                // Try again with incremented attempts
                                KohaPreprocessor(provider, data.content, func, newCookies, retryUrl, challengeAttempts + 1);
                                return;
                            }
                            
                            // Success! Pass the content to the parser
                            func(data.content);
                        }).fail(function() {
                            func("");
                        });
                    }).fail(function() {
                        console.log("Failed to submit BotStopper solution");
                        func("");
                    });
                }).catch(function(error) {
                    console.error("Error solving BotStopper challenge:", error);
                    func("");
                });
                
                return; // Exit early since we're handling this asynchronously
            } else {
                // Fallback: Browser doesn't support WebCrypto API
                console.log("Browser doesn't support WebCrypto API for SHA-256");
                func("");
                return;
            }
            
        } catch (e) {
            console.error("Failed to handle BotStopper challenge:", e);
            func("");
            return;
        }
    }
    
    // If not a BotStopper page, pass through the content
    func(content);
};