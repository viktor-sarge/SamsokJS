// SHA-256 fallback implementation for environments without WebCrypto API
// This is used when crypto.subtle is not available (e.g., HTTP non-localhost)

var SHA256Fallback = (function() {
    
    // SHA-256 constants
    var K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    
    // Initial hash values
    var H = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    
    function rightRotate(n, b) {
        return (n >>> b) | (n << (32 - b));
    }
    
    function sha256(ascii) {
        var words = [];
        var asciiBitLength = ascii.length * 8;
        
        // Convert string to 32-bit words
        var j = 0;
        for (var i = 0; i < ascii.length; i++) {
            var charCode = ascii.charCodeAt(i);
            if ((i & 3) === 0) {
                words[j >> 2] = charCode << 24;
            } else {
                words[j >> 2] |= charCode << ((3 - (i & 3)) * 8);
            }
            j++;
        }
        
        // Padding
        words[j >> 2] |= 0x80 << ((3 - (j & 3)) * 8);
        j++;
        
        // More padding
        while ((j & 63) !== 56) {
            if ((j & 3) === 0) {
                words[j >> 2] = 0;
            }
            j++;
        }
        
        // Length in bits
        words[j >> 2] = Math.floor(asciiBitLength / 0x100000000);
        words[(j >> 2) + 1] = asciiBitLength & 0xffffffff;
        
        var wordLength = words.length;
        
        // Process the message in 512-bit chunks
        var h0 = H[0], h1 = H[1], h2 = H[2], h3 = H[3],
            h4 = H[4], h5 = H[5], h6 = H[6], h7 = H[7];
        
        for (var offset = 0; offset < wordLength; offset += 16) {
            var a = h0, b = h1, c = h2, d = h3,
                e = h4, f = h5, g = h6, h = h7;
            
            var w = new Array(64);
            
            // Copy chunk into first 16 words of the message schedule
            for (var i = 0; i < 16; i++) {
                w[i] = words[offset + i] | 0;
            }
            
            // Extend the first 16 words into the remaining 48 words
            for (var i = 16; i < 64; i++) {
                var s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                var s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            
            // Compression function main loop
            for (var i = 0; i < 64; i++) {
                var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
                var ch = (e & f) ^ ((~e) & g);
                var temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
                var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
                var maj = (a & b) ^ (a & c) ^ (b & c);
                var temp2 = (S0 + maj) | 0;
                
                h = g;
                g = f;
                f = e;
                e = (d + temp1) | 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) | 0;
            }
            
            // Add the compressed chunk to the current hash value
            h0 = (h0 + a) | 0;
            h1 = (h1 + b) | 0;
            h2 = (h2 + c) | 0;
            h3 = (h3 + d) | 0;
            h4 = (h4 + e) | 0;
            h5 = (h5 + f) | 0;
            h6 = (h6 + g) | 0;
            h7 = (h7 + h) | 0;
        }
        
        // Produce the final hash value as a hex string
        return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) +
               toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
    }
    
    function toHex(n) {
        var hex = '';
        for (var i = 7; i >= 0; i--) {
            var digit = (n >>> (i * 4)) & 0xf;
            hex += digit.toString(16);
        }
        return hex;
    }
    
    // Public API that matches the async crypto.subtle.digest interface
    return {
        // Synchronous version for direct use
        hash: function(message) {
            return sha256(message);
        },
        
        // Async version that mimics crypto.subtle.digest('SHA-256', ...) 
        // Returns a Promise for compatibility
        digest: function(message) {
            return new Promise(function(resolve, reject) {
                try {
                    var hash = sha256(message);
                    resolve(hash);
                } catch (e) {
                    reject(e);
                }
            });
        }
    };
})();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SHA256Fallback;
}