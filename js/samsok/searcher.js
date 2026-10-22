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
    oneHit: false,
    allHitsFetched: false,
    percent: null,
    resolvedUrl: null,

    numberOfHits: function() {
        return this.get('searchHits').length;
    }.property('searchHits'),

    url: function() {
        // Providers with a gotoUrl search through an API, so their resolved search URL isn't a page to show
        if (this.get('provider').get('gotoUrl')) {
            return this.get('provider').getGotoUrl(this.get('query'));
        }
        return this.get('resolvedUrl') || this.get('provider').getGotoUrl(this.get('query'));
    }.property('resolvedUrl', 'query'),

    search: function() {
        this.set('isFailed', false);
        this.set('isDone', false);
        this.set('resolvedUrl', null);

        var outerThis = this;

        var searchUrl = this.get('provider').getSearchUrl(this.get('query'));

        var runWorker = function(content, newSearchUrl) {
            // Preprocessors pass on empty content when they couldn't get the search results
            if (!content) {
                outerThis.set('isFailed', true);
                outerThis.set('isDone', true);
                return;
            }

            var s;
            if (newSearchUrl)
                s = newSearchUrl;
            else
                s = searchUrl;

            outerThis.set('resolvedUrl', s);

            spawnWorker(outerThis.get('provider').get('parser'), content, outerThis.get('provider').get('baseUrl'), s,
                function(e) {
                    var location = outerThis.get('provider').get('name');
                    e.hits.forEach(function(hit) {
                        hit['location'] = location;
                    });
                    outerThis.set('totalHits', e.totalHits);
                    outerThis.set('searchHits', e.hits);
                    if (e.hits.length === 1) {
                        outerThis.set('oneHit', true);
                    }
                    if (e.totalHits > 0 && e.hits.length >= e.totalHits) {
                        outerThis.set('allHitsFetched', true)
                    }
                    if (e.totalHits == 0) {
                        outerThis.set('percent', 100);
                    } else {
                        outerThis.set('percent', Math.floor((e.hits.length / e.totalHits) * 100));
                        if (outerThis.get('percent') == 0) {
                            outerThis.set('percent', ((e.hits.length / e.totalHits) * 100).toFixed(2));
                        }
                    }
                    outerThis.set('isFailed', false);
                    outerThis.set('isDone', true);
                }, function(e) {
                    outerThis.set('isFailed', true);
                    outerThis.set('isDone', true);
                }
            );
        };

        // Providers searching through an API from their preprocessor have no use for the search page
        if (!this.get('provider').get('fetchSearchPage')) {
            this.get('provider').get('preprocessor')(this.get('provider'), '', runWorker, null, searchUrl);
            return;
        }

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

            var preprocessor = outerThis.get('provider').get('preprocessor');
            if (preprocessor) {
                preprocessor(outerThis.get('provider'), data.content, runWorker, data.cookies, searchUrl);
            } else {
                var resolvedSearchUrl = searchUrl;
                if (data.status && data.status.resolved_url) {
                    resolvedSearchUrl = data.status.resolved_url;
                }
                runWorker(data.content, resolvedSearchUrl);
            }
        });
    }
});
