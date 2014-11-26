QUERY_TOKEN = '@QUERY@';

App.ProviderGroup = Ember.Object.extend({
    groupName: null,
    providers: null
});

App.Provider = Ember.Object.extend({
    parser: null,
    baseUrl: null,
    searchUrl: null,
    name: null,
    gotoUrl: null,
    encoding: null,
    enabled: false,

    init: function() {
        this.set('enabled', isProviderEnabled(this.get('name')));
    },

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
    },

    enabledDidChange: function() {
        setProviderEnabled(this.get('name'), this.get('enabled'));
    }.observes('enabled')
});

var providers = [
    App.ProviderGroup.create({
        groupName: 'Testgrupp',
        providers: [
            App.Provider.create({
                parser: App.XsearchParser.create(),
                baseUrl: 'http://www.sverigesdepabibliotekochlanecentral.se/',
                searchUrl: 'http://libris.kb.se/xsearch?query=@QUERY@%20AND%20bibl:umdp&format=json&holdings=true&n=200',
                name: 'Depåbiblioteket i Umeå',
                gotoUrl: 'http://libris.kb.se/hitlist?q=@QUERY@+bib%3aumdp&d=libris&m=10&p=1&s=r',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: App.SsbParser.create(),
                baseUrl: 'https://biblioteket.stockholm.se/',
                searchUrl: 'http://biblioteket.stockholm.se/sok?freetext=',
                name: 'Stockholms Stadsbibliotek',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: App.GotlibParser.create(),
                baseUrl: 'http://encore.gotlib.goteborg.se/',
                searchUrl: 'http://encore.gotlib.goteborg.se/iii/encore/search/C__S@QUERY@__Orightresult__U1?lang=swe&suite=pearl',
                name: 'Göteborg',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: App.MalmoParser.create(),
                baseUrl: 'http://malmo.stadsbibliotek.org/',
                searchUrl: 'http://malmo.stadsbibliotek.org/search~S7*swe/?SUBMIT=Sök+%3E%3E%searchtype=X&searcharg=',
                name: 'Malmö',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: App.OlaParser.create(),
                baseUrl: 'http://bibliotek.boras.se/',
                searchUrl: 'http://bibliotek.boras.se/search?query=@QUERY@&searchtype=Biblioteket&sort=Relevance&fLibId=00000000-0000-0000-0000-000000000000',
                name: 'Borås',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: App.KohaParser.create(),
                baseUrl: 'http://hylte.bibkat.se/',
                searchUrl: 'http://hylte.bibkat.se/cgi-bin/koha/opac-search.pl?q=@QUERY@&branch_group_limit=',
                name: 'Hylte',
                encoding: 'utf-8'
            })
        ]
    })
];

function isProviderEnabled(provider) {
    if (!Modernizr.localstorage) {
        return true;
    }
    if (!window.localStorage['disabledProviders']) {
        return true;
    }

    var disabledProviders = JSON.parse(window.localStorage["disabledProviders"]);
    return disabledProviders.indexOf(provider) == -1;
}

function setProviderEnabled(provider, enabled) {
    if (!Modernizr.localstorage) {
        return;
    }

    var disabledProviders = [];
    if (window.localStorage['disabledProviders']) {
        disabledProviders = JSON.parse(window.localStorage["disabledProviders"]);
    }

    if (!enabled) {
        if (disabledProviders.indexOf(provider) == -1) {
            disabledProviders.push(provider);
        }
    } else {
        if (disabledProviders.indexOf(provider) != -1) {
            disabledProviders.splice(disabledProviders.indexOf(provider), 1);
        }
    }
    window.localStorage['disabledProviders'] = JSON.stringify(disabledProviders);
}
