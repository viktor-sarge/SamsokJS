QUERY_TOKEN = '@QUERY@';

App.Provider = Ember.Object.extend({
    parser: null,
    baseUrl: null,
    searchUrl: null,
    name: null,
    gotoUrl: null,

    getSearchUrl: function(query) {
        if (this.get('searchUrl').indexOf(QUERY_TOKEN) >= 0)
            return this.get('searchUrl').replace(QUERY_TOKEN, query);
        else
            return this.get('searchUrl') + query;
    },

    getGotoUrl: function(query) {
        if (!this.get('gotoUrl')) {
            return this.getSearchUrl(query)
            return this.getSearchUrl(query);
        } else {
            if (this.gotoUrl.indexOf(QUERY_TOKEN) >= 0)
                return this.gotoUrl.replace(QUERY_TOKEN, query);
            else
                return this.gotoUrl + query;
        }
    }
});

var providers = [
    App.Provider.create({
        parser: App.XsearchParser.create(),
        baseUrl: 'http://www.sverigesdepabibliotekochlanecentral.se/',
        searchUrl: 'http://libris.kb.se/xsearch?query=@QUERY@%20AND%20bibl:umdp&format=json&holdings=true&n=200',
        name: 'Depåbiblioteket i Umeå',
        gotoUrl: 'http://libris.kb.se/hitlist?q=@QUERY@+bib%3aumdp&d=libris&m=10&p=1&s=r'
    }),
    App.Provider.create({
        parser: App.SsbParser.create(),
        baseUrl: 'https://biblioteket.stockholm.se',
        searchUrl: 'https://biblioteket.stockholm.se/sok?freetext=',
        name: 'Stockholms Stadsbibliotek'
    })
];

function getChosenProviders() {
    return providers;
}