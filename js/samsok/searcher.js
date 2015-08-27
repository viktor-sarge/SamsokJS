var proxyBaseUrl = (location.protocol == 'https:' ? 'https:' : 'http:') + "//samsokproxy.appspot.com/crossdomain";

// Create a Web Worker from a function, which fully runs in the scope of a new
//    Worker
function spawnWorker(func, content, baseUrl, searchUrl, callback, errorhandler) {
    // Stringify the code. Example:  (function(){/*logic*/}).call(self);
    var code = 'self.postMessage((' + func + ').call(self, "' + escapeString(content) + '", "' + escapeString(baseUrl) + '", "' + escapeString(searchUrl) + '"));';
    try {
        var worker = new Worker('js/samsok/webworker.js');
    } catch(err) {
        // This could fail because of an old browser that doesn't support web workers, or because of Chrome's
        // security settings when running from file://
        // Run it in the main thread instead!
        try {
            callback(func(content, baseUrl, searchUrl));
        } catch (err) {
            errorhandler(err);
        }
        return;
    }
    // Initialise worker
    worker.onmessage = function(e) {
        if (e.data.debug) {
            console.log(JSON.parse(e.data.debug));
        } else {
            callback(e.data);
        }
    };
    worker.onerror = errorhandler;
    worker.postMessage(code);
    return worker;
}

function escapeString(string) {
    return ('' + string).replace(/["'\\\n\r\u2028\u2029]/g, function (character) {
        // Escape all characters not included in SingleStringCharacters and
        // DoubleStringCharacters on
        // http://www.ecma-international.org/ecma-262/5.1/#sec-7.8.4
        switch (character) {
            case '"':
            case "'":
            case '\\':
                return '\\' + character;
            // Four possible LineTerminator characters need to be escaped:
            case '\n':
                return '\\n';
            case '\r':
                return '\\r';
            case '\u2028':
                return '\\u2028';
            case '\u2029':
                return '\\u2029';
        }
    })
}

App.Searcher = Ember.Object.extend({
    provider: null,
    query: null,
    isDone: false,
    isFailed: false,
    searchHits: [],
    totalHits: null,

    numberOfHits: function() {
        return this.get('searchHits').length;
    }.property('searchHits'),

    url: function() {
        return this.get('provider').getGotoUrl(this.get('query'));
    }.property(),

    search: function() {
        this.set('isFailed', false);
        this.set('isDone', false);

        var outerThis = this;

        var searchUrl = this.get('provider').getSearchUrl(this.get('query').replace(/ /g, '%20'));
        var proxyUrl = proxyBaseUrl + "?url=" +
            encodeURIComponent(searchUrl) +
            "&encoding=" + this.get('provider').get('encoding') +
            "&callback=?";
        $.getJSON(proxyUrl)
        .done(function(data) {

            if (!data.content) {
                outerThis.set('isFailed', true);
                outerThis.set('isDone', true);
                return;
            }

            var runWorker = function(content) {
                spawnWorker(outerThis.get('provider').get('parser'), content, outerThis.get('provider').get('baseUrl'), searchUrl,
                    function(e) {
                        var location = outerThis.get('provider').get('name');
                        e.hits.forEach(function(hit) {
                            hit['location'] = location;
                        });
                        outerThis.set('totalHits', e.totalHits);
                        outerThis.set('searchHits', e.hits);
                        outerThis.set('isFailed', false);
                        outerThis.set('isDone', true);
                    }, function(e) {
                        outerThis.set('isFailed', true);
                        outerThis.set('isDone', true);
                    }
                );
            };

            var preprocessor = outerThis.get('provider').get('preprocessor');
            if (preprocessor) {
                preprocessor(outerThis.get('provider'), data.content, runWorker);
            } else {
                runWorker(data.content);
            }
        });
    }
});
