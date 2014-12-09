App.SearchRoute = Ember.Route.extend({
    activate: function() {
        this._super.apply(this, arguments);
        Ember.run.scheduleOnce('afterRender', this, scrollToSearchresult);
    }
});

App.SearchController = Ember.Controller.extend({
    needs: 'providers',
    queryParams: ['query'],
    query: null,
    searchers: [],
    searcherCache: new Array(),

    actions: {
        retryFailed: function(searcher) {
            searcher.search();
        }
    },

    queryDidChange: function() {
        this.get('searchers').clear();
        this.updateSearchers();
    }.observes('query'),

    updateSearchers: function() {
        // Add any new providers
        if (this.get('query')) {
            var outerThis = this;
            this.get('controllers.providers.allProviders').filterBy('enabled', true).forEach(function(provider) {
                var exists = false;
                outerThis.get('searchers').forEach(function(searcher) {
                    if (searcher.get('provider.name') == provider.get('name')) {
                        exists = true;
                    }
                });

                if (!exists) {
                    var query = outerThis.get('query');
                    var searcher = null;
                    var cache = outerThis.get('searcherCache');
                    if (cache[provider.get('name')]) {
                        if (cache[provider.get('name')][query]) {
                            searcher = cache[provider.get('name')][query];
                        }
                    }
                    if (!searcher) {
                        searcher = App.Searcher.create({
                            provider: provider,
                            query: query
                        });
                        searcher.search();

                        if (!cache[provider.get('name')]) {
                            cache[provider.get('name')] = new Array();
                        }
                        cache[provider.get('name')][query] = searcher;
                    }
                    outerThis.get('searchers').pushObject(searcher);
                }
            });

            // Remove any that are no longer enabled
            this.get('searchers').forEach(function(searcher) {
                var exists = false;
                outerThis.get('controllers.providers.allProviders').filterBy('enabled', false).forEach(function(provider) {
                        if (searcher.get('provider.name') == provider.get('name')) {
                            exists = true;
                        }
                    });

                if (exists) {
                    outerThis.get('searchers').removeObject(searcher);
                }
            });
        }
    }.observes('controllers.providers.allProviders', 'controllers.providers.allProviders.@each.enabled'),

    remainingSearchers: function() {
        return this.get('searchers').filter(function(searcher) {
            return !searcher.get('isDone') && !searcher.get('isFailed');
        });
    }.property('searchers.@each.isDone'),

    doneSearchers: function() {
        return this.get('searchers').filter(function(searcher) {
            return searcher.get('isDone') && !searcher.get('isFailed');
        });
    }.property('searchers.@each.isDone'),

    failedSearchers: function() {
        return this.get('searchers').filter(function(searcher) {
            return searcher.get('isDone') && searcher.get('isFailed');
        });
    }.property('searchers.@each.isDone'),

    totalHits: function() {
        var hits = 0;
        this.get('searchers').forEach(function(searcher) {
            hits = hits + searcher.get('numberOfHits');
        });
        return hits;
    }.property('searchers.@each.numberOfHits'),

    progress: function() {
        if (this.get('searchers').get('length') == 0) {
            return 100;
        }

        var done = 0;
        this.get('searchers').forEach(function(searcher) {
            if (searcher.get('isDone')) {
                done = done + 1;
            }
        });
        return Math.round(100 * done / this.get('searchers').get('length'));
    }.property('searchers.@each.isDone'),

    progressStyle: function() {
        return "width: " + this.get("progress") + "%";
    }.property("progress"),

    progressClass: function() {
        if (this.get("progress") < 100)
            return "progress-bar progress-bar-info progress-bar-striped";
        else
            return "progress-bar progress-bar-success progress-bar-striped";
    }.property("progress"),

    searchHits: function() {
        var term = null;
        if (this.get('searchFilter'))
            term = this.get('searchFilter').toUpperCase();

        var contents = [];
        this.get('searchers').forEach(function (searcher) {
            contents.pushObjects(searcher.get('searchHits'));
        });
        var result = Ember.ArrayProxy.createWithMixins(Ember.SortableMixin, {
            content: contents,
            sortProperties: ['title'],
            sortAscending: true
        });

        if (term) {
            return result.filter(function (hit) {
                for (var property in hit) {
                    if (hit.hasOwnProperty(property)) {
                        if ((typeof hit[property] == 'string')) {
                            if (hit[property].toUpperCase().indexOf(term) >= 0) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            });
        } else {
            return result;
        }
    }.property('searchers.@each.searchHits', 'searchFilter')
});

App.SearchView = Ember.View.extend(App.ScrollLinksMixin);

App.SearchHitController = Ember.Controller.extend({
    actions: {
        openLibris: function() {
            var url = "http://libris.kb.se/hitlist?d=libris&q=";
            var fields = ['author', 'title', 'year'];
            var params = [];
            var outerThis = this;

            fields.forEach(function(field) {
                if (outerThis.get('model.' + field)) {
                    params.push(outerThis.get('model.' + field));
                }
            });
            url = url + params.join('+');


            window.open(url, "_blank");
        }
    }
});