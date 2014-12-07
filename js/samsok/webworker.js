importScripts('utilities.js', '../cheerio.browserified.min.js');

// Rig up so we can use console.log in workers
console = {
    log: function(data) {
        self.postMessage({
            debug: JSON.stringify(data)
        });
    }
};

self.onmessage = function(e) {
    self.onmessage = null; // Clean-up
    eval(e.data);
};
