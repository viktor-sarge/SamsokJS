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
    preprocessor: null,
    queryModifier: DefaultQueryModifier,

    init: function() {
        this.set('enabled', isProviderEnabled(this.get('name')));
    },

    getSearchUrl: function(query) {
        if (this.get('queryModifier'))
            query = this.get('queryModifier')(query);

        if (this.get('searchUrl').indexOf(QUERY_TOKEN) >= 0)
            return this.get('searchUrl').replace(QUERY_TOKEN, query);
        else
            return this.get('searchUrl') + query;
    },

    getGotoUrl: function(query) {
        if (!this.get('gotoUrl')) {
            return this.getSearchUrl(query);
        } else {
            if (this.get('queryModifier'))
                query = this.get('queryModifier')(query);

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
        groupName: 'Halland',
        providers: [
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                queryModifier: SpacetoPlusQueryModifier,
                baseUrl: '',
                searchUrl: 'https://bibliotek.falkenberg.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Falkenberg',
                encoding: 'utf-8'
            }),        
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                queryModifier: SpacetoPlusQueryModifier, 
                baseUrl: '',
                searchUrl: 'https://nova.halmstad.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Halmstad',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: XsearchParser,
                baseUrl: '',
                searchUrl: 'http://libris.kb.se/xsearch?query=@QUERY@%20AND%20bibl:hal&format=json&holdings=true&n=200',
                name: 'Halmstad Högskolebibliotek',
                gotoUrl: 'http://libris.kb.se/hitlist?q=@QUERY@+bib%3aumdp&d=libris&m=10&p=1&s=r',
                encoding: 'utf-8'
            }),        
             App.Provider.create({
                parser: KohaParser,
                baseUrl: 'http://hylte.bibkat.se/',
                searchUrl: 'http://hylte.bibkat.se/cgi-bin/koha/opac-search.pl?q=@QUERY@&branch_group_limit=',
                name: 'Hylte',
                encoding: 'utf-8'
            }),       
            App.Provider.create({
                parser: ArenaParser,
                baseUrl: '',
                searchUrl: 'https://bibliotek.kungsbacka.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Kungsbacka',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
				preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://biblioteket.laholm.se/web/pub/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Laholm',
                encoding: 'utf-8'
            }),            
            App.Provider.create({
                parser: ArenaParser,
                baseUrl: 'https://bibliotek.varberg.se/web/arena',
                searchUrl: 'https://bibliotek.varberg.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Varberg',
                encoding: 'utf-8'
            })
        ]
    }),
    App.ProviderGroup.create({
        groupName: 'Lånecentralen',
        providers: [
            App.Provider.create({
                parser: XsearchParser,
                baseUrl: 'http://www.sverigesdepabibliotekochlanecentral.se/',
                searchUrl: 'http://libris.kb.se/xsearch?query=@QUERY@%20AND%20bibl:umdp&format=json&holdings=true&n=200',
                name: 'Depåbiblioteket i Umeå',
                gotoUrl: 'http://libris.kb.se/hitlist?q=@QUERY@+bib%3aumdp&d=libris&m=10&p=1&s=r',
                encoding: 'utf-8'
            })        
        ]
    }),
    App.ProviderGroup.create({
        groupName: 'Andra regioner',
        providers: [
            App.Provider.create({
                parser: MinabibliotekParser,
                baseUrl: 'http://bibliotek.boras.se/',
                searchUrl: 'https://bibliotek.boras.se/search?query=@QUERY@&fMediaId=&fTarget=&fLang=',
                name: 'Borås',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor, 
                baseUrl: '',
                searchUrl: 'https://www.falkopingsbibliotek.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Falköping',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: GotlibParser,
                baseUrl: 'http://encore.gotlib.goteborg.se/',
                searchUrl: 'http://encore.gotlib.goteborg.se/iii/encore/search/C__S@QUERY@__Orightresult__U1?lang=swe&suite=pearl',
                name: 'Göteborg',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: MinabibliotekParser, 
                baseUrl: 'https://bibliotek.jonkoping.se/',
                searchUrl: 'https://bibliotek.jonkoping.se/search?query=@QUERY@&fMediaId=&fTarget=',
                name: 'Jönköping',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor, 
                baseUrl: '',
                searchUrl: 'https://bibliotek.kalmar.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Kalmar',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor, 
                baseUrl: '',
                searchUrl: 'https://bibliotek.karlskrona.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Karlskrona',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: MalmoParser,
                baseUrl: 'http://malmo.stadsbibliotek.org/',
                searchUrl: 'http://malmo.stadsbibliotek.org/search~S7*swe/?searchtype=X&SORT=D&searcharg=',
                name: 'Malmö',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor, 
                baseUrl: '',
                searchUrl: 'https://bibliotek.mark.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Mark',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor, 
                baseUrl: '',
                searchUrl: 'https://snokabibliotek.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'SkåneNO',
                encoding: 'utf-8'
            }),     
            App.Provider.create({
                parser: SsbParser,
                baseUrl: 'https://biblioteket.stockholm.se/',
                searchUrl: 'http://biblioteket.stockholm.se/sok?freetext=',
                name: 'Stockholms Stadsbibliotek',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: MinabibliotekParser,
                baseUrl: 'http://www.minabibliotek.se/',
                searchUrl: 'https://www.minabibliotek.se/search?query=@QUERY@&fMediaId=&fTarget=',
                name: 'Umeå - Mina bibliotek',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor, 
                baseUrl: '',
				searchUrl: 'https://bibliotek.vskaraborg.se/web/pub/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
				name: 'Bibliotek Västra Skaraborg',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: MicroMarcParser,
                baseUrl: 'http://webbsok.mikromarc.se/Mikromarc3/web/',
                searchUrl: 'http://webbsok.mikromarc.se/Mikromarc3/Web/search.aspx?Unit=6469&db=vargarda&SC=FT&SW=@QUERY@&LB=FT&IN=&SU=0&',
                name: 'Vårgårda',
                encoding: 'utf-8'
            }),  
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor, 
                baseUrl: '',
                searchUrl: 'https://bibliotek.vaxjo.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Växjö',
                encoding: 'utf-8'
            })  
        ]
    })
];

function isMsie() {
    var ua = window.navigator.userAgent;
    var msie = ua.indexOf("MSIE ");

    if (msie > 0 || !!navigator.userAgent.match(/Trident.*rv\:11\./))
        return true;
    else
        return false;
}

$.cookie.json = true;

// Use cookies for MSIE, localStorage otherwise when available. This is because MSIE won't allow localStorage when running on
// file://, and Chrome won't allow cookies when running from file://

function getDisabledProviders() {
    if (isMsie() || !Modernizr.localstorage) {
        var disabledProviders = $.cookie('disabledProviders');
        if (disabledProviders)
            return disabledProviders;
    } else {
        if (window.localStorage['disabledProviders']) {
            try {
                return JSON.parse(window.localStorage["disabledProviders"]);
            } catch (err) {
            }
        }
    }
    return [];
}

function setDisabledProviders(disabledProviders) {
    if (isMsie() || !Modernizr.localstorage)
        $.cookie('disabledProviders', disabledProviders, { expires: 365 });
    else {
        window.localStorage['disabledProviders'] = JSON.stringify(disabledProviders);
    }
}

function isProviderEnabled(provider) {
    var disabledProviders = getDisabledProviders();
    return disabledProviders.indexOf(provider) == -1;
}

function setProviderEnabled(provider, enabled) {
    var disabledProviders = getDisabledProviders();

    if (!enabled) {
        if (disabledProviders.indexOf(provider) == -1) {
            disabledProviders.push(provider);
        }
    } else {
        if (disabledProviders.indexOf(provider) != -1) {
            disabledProviders.splice(disabledProviders.indexOf(provider), 1);
        }
    }

    setDisabledProviders(disabledProviders);
}
