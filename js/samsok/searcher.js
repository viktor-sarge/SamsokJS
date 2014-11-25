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

        $.getJSON("http://query.yahooapis.com/v1/public/yql?"+
                "q=select%20*%20from%20html%20where%20url%3D%22"+
                encodeURIComponent(this.get('provider').getSearchUrl(this.query.replace(' ', '+')))+
                "%22&format=xml'&callback=?"
        )
        .done(function(data) {
            try {
                var searchHits = outerThis.get('provider').get('parser').getHits(data.results[0], outerThis.get('provider').get('baseUrl'));
                outerThis.set('searchHits', searchHits);
                outerThis.set('isDone', true);
            } catch (err) {
                console.log(err);
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
