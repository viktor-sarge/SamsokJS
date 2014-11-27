var proxyBaseUrl = "http://samsokproxy.appspot.com/crossdomain";

App.Searcher = Ember.Object.extend({
    provider: null,
    query: null,
    isDone: false,
    isFailed: false,
    searchHits: [],

    numberOfHits: function() {
        return this.get('searchHits').length;
    }.property('searchHits'),

    totalHits: function() {
        return this.get('provider').get('parser').get('totalHits');
    }.property(),

    url: function() {
        return this.get('provider').getGotoUrl(this.get('query'));
    }.property(),

    search: function() {
        this.set('isFailed', false);
        this.set('isDone', false);

        var outerThis = this;

        $.getJSON(proxyBaseUrl + "?url=" +
                encodeURIComponent(this.get('provider').getSearchUrl(this.get('query').replace(' ', '%20')))+
                "&encoding=" + this.get('provider').get('encoding') +
                "&callback=?"
        )
        .done(function(data) {
            try {
                if (!data.content) {
                    outerThis.set('isFailed', true);
                    outerThis.set('isDone', true);
                    return;
                }

                var searchHits = outerThis.get('provider').get('parser').getHits(data.content, outerThis.get('provider').get('baseUrl'));
                outerThis.set('searchHits', searchHits);
                outerThis.set('isDone', true);
            } catch (err) {
                outerThis.set('isFailed', true);
                outerThis.set('isDone', true);
            }
        })
        .fail(function() {
                outerThis.set('isFailed', true);
                outerThis.set('isDone', true);
        });
    }
});
