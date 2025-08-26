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
                parser: KohaParser,
                preprocessor: KohaPreprocessor,
                baseUrl: 'https://bibliotekskatalog.falkenberg.se/',
                searchUrl: 'https://bibliotekskatalog.falkenberg.se/cgi-bin/koha/opac-search.pl?q=@QUERY@&S%C3%B6k=',
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
                preprocessor: KohaPreprocessor,
                baseUrl: 'http://hylte.bibkat.se/',
                searchUrl: 'http://hylte.bibkat.se/cgi-bin/koha/opac-search.pl?q=@QUERY@&branch_group_limit=',
                name: 'Hylte',
                encoding: 'utf-8'
            }),       
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://bibliotek.kungsbacka.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Kungsbacka',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
				preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://bibliotek.laholm.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Laholm',
                encoding: 'utf-8'
            }),            
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
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
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://bibliotek.jonkoping.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
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
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://knallebiblioteken.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescendinghttps://knallebiblioteken.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Knallebiblioteken',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: MalmoParser,
                preprocessor: MalmoPreprocessor,
                baseUrl: 'https://malin.malmo.se/',
                searchUrl: 'https://malin.malmo.se/search?query=@QUERY@&searchType=everything&pageSize=40',
                name: 'Malmö',
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
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor, 
                baseUrl: '',
                searchUrl: 'https://bibliotek.vaxjo.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_query=@QUERY@&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending',
                name: 'Växjö',
                encoding: 'utf-8'
            })  
        ]
    }),
    App.ProviderGroup.create({
        groupName: 'Västra Götaland',
        providers: [
            App.Provider.create({
                parser: KohaParser,
                preprocessor: KohaPreprocessor,
                baseUrl: 'https://kohaopac.alingsas.se',
                searchUrl: 'https://kohaopac.alingsas.se/cgi-bin/koha/opac-search.pl?idx=&q=@QUERY@&weight_search=1',
                name: 'Alingsås',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                queryModifier: SpacetoPlusQueryModifier,
                baseUrl: '',
                searchUrl: 'https://bibliotekdalsland.se/web/arena/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Bibliotek Dalsland',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://biv.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Bibliotek i Väst',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: KohaParser,
                preprocessor: KohaPreprocessor,
                baseUrl: 'https://bibliotekmellansjo.se',
                searchUrl: 'https://bibliotekmellansjo.se/cgi-bin/koha/opac-search.pl?q=@QUERY@&branch_group_limit=',
                name: 'Bibliotek Mellansjö',
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
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://bibliotekenifyrstad.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Biblioteken i Fyrstad',
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
                searchUrl: 'http://encore.gotlib.goteborg.se/iii/encore/search/C__S@QUERY@__Orightresult__U?lang=swe&suite=pearl',
                name: 'Göteborg',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://bibliotek.harryda.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Härryda',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://knallebiblioteken.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Knallebiblioteken',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: KohaParser,
                preprocessor: KohaPreprocessor,
                baseUrl: 'https://kolerum-opac.prod.imcode.com/',
                searchUrl: 'https://kolerum-opac.prod.imcode.com/cgi-bin/koha/opac-search.pl?idx=&weight_search=1&q=@QUERY@',
                name: 'Lerum',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://bibliotek.molndal.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Mölndal',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: ArenaParser,
                preprocessor: ArenaPreprocessor,
                baseUrl: '',
                searchUrl: 'https://bibliotek.ranrike.se/search?p_p_id=searchResult_WAR_arenaportlet&p_p_lifecycle=1&p_p_state=normal&p_r_p_arena_urn%3Aarena_facet_queries=&p_r_p_arena_urn%3Aarena_search_type=solr&p_r_p_arena_urn%3Aarena_sort_advice=field%3DRelevance%26direction%3DDescending&p_r_p_arena_urn%3Aarena_search_query=',
                name: 'Norra Bohuslän',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: KohaParser,
                preprocessor: KohaPreprocessor,
                baseUrl: 'https://bibliotekskatalog.partille.se',
                searchUrl: 'https://bibliotekskatalog.partille.se/cgi-bin/koha/opac-search.pl?idx=&weight_search=1&q=@QUERY@',
                name: 'Partille',
                encoding: 'utf-8'
            })
        ]
    }),
    App.ProviderGroup.create({
        groupName: 'Övriga',
        providers: [
            App.Provider.create({
                parser: XsearchParser,
                baseUrl: 'http://www.sverigesdepabibliotekochlanecentral.se/',
                searchUrl: 'http://libris.kb.se/xsearch?query=@QUERY@%20AND%20bibl:umdp&format=json&holdings=true&n=200',
                name: 'Depåbiblioteket i Umeå',
                gotoUrl: 'http://libris.kb.se/hitlist?q=@QUERY@+bib%3aumdp&d=libris&m=10&p=1&s=r',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: SsbParser,
                preprocessor: StockholmPreprocessor,
                baseUrl: 'https://biblioteket.stockholm.se/',
                searchUrl: 'https://biblioteket.stockholm.se/sok?text=@QUERY@',
                name: 'Stockholms stadsbibliotek',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: MalmoParser,
                preprocessor: MalmoPreprocessor,
                baseUrl: 'https://malin.malmo.se/',
                searchUrl: 'https://malin.malmo.se/search?query=@QUERY@&searchType=everything&pageSize=40',
                name: 'Malmö',
                encoding: 'utf-8'
            }),
            App.Provider.create({
                parser: MinabibliotekParser,
                baseUrl: 'http://www.minabibliotek.se/',
                searchUrl: 'https://www.minabibliotek.se/search?query=@QUERY@&fMediaId=&fTarget=',
                name: 'Mina bibliotek',
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
