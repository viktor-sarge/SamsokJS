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
        var outerThis = this;

        $.getJSON("http://query.yahooapis.com/v1/public/yql?"+
                "q=select%20*%20from%20html%20where%20url%3D%22"+
                encodeURIComponent(this.get('provider').getSearchUrl(this.query))+
                "%22&format=xml'&callback=?"
        )
        .done(function(data) {
            var searchHits = outerThis.get('provider').get('parser').getHits(data.results[0], outerThis.get('provider').get('baseUrl'));
            outerThis.set('searchHits', searchHits);
            outerThis.set('isDone', true);
        })
        .fail(function() {
                outerThis.set('isDone', true);
                outerThis.set('isFailed', true);
        });
    }
});
