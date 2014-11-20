var searchIdCounter = 0;

App.SearchHit = Ember.Object.extend({
    title: null,
    author: null,
    type: null,
    year: null,
    url: null
});

App.XsearchParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];

        // YQL gives us some crap around the JSON that we need to remove
        content = content.replace(/^[^{]*/mg, '');
        content = content.replace(/[^}]*$/mg, '');

        var js = jQuery.parseJSON(content)['xsearch'];
        this.set('totalHits', js['records']);

        js['list'].forEach(function(result) {
            hits.push(
                App.SearchHit.create({
                    title: result['title'],
                    author: result['creator'],
                    type: result['type'],
                    year: result['date'],
                    url: result['identifier']
                })
            );
        });

        return hits;
    }
});

App.SsbParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];

        return hits;
    }
});