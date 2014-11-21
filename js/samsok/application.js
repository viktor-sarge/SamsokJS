window.App = Ember.Application.create();

function scrollToSearchresult() {
    $('html, body').stop().animate({
        scrollTop: $("#searchresult").offset().top
    }, 1500, 'easeInOutExpo');
}

App.Router.map(function() {
    this.resource('search', {path: '/search/:query'})
});

App.ApplicationController = Ember.Controller.extend({
    actions: {
        doSearch: function(query) {
            scrollToSearchresult();
            this.transitionToRoute('search', query);
        }
    }
});

App.IndexRoute = Ember.Route.extend({

});

App.SearchRoute = Ember.Route.extend({
    activate: function() {
        this._super.apply(this, arguments);
        Ember.run.scheduleOnce('afterRender', this, scrollToSearchresult);
    },

    model: function(params) {
        var searchers = [];
        getChosenProviders().forEach(function(p) {
            var searcher = App.Searcher.create({
                provider: p,
                query: params.query
            });
            searcher.search();
            searchers.push(searcher);
        });
        return {
            searchQuery: params.query,
            searchers: searchers
        };
    }
});

App.SearchController = Ember.Controller.extend({
    remainingSearchers: function() {
        return this.get('model.searchers').filter(function(searcher) {
            return !searcher.get('isDone') && !searcher.get('isFailed');
        });
    }.property('model.searchers.@each.isDone'),

    doneSearchers: function() {
        return this.get('model.searchers').filter(function(searcher) {
            return searcher.get('isDone') && !searcher.get('isFailed');
        });
    }.property('model.searchers.@each.isDone'),

    failedSearchers: function() {
        return this.get('model.searchers').filter(function(searcher) {
            return searcher.get('isDone') && searcher.get('isFailed');
        });
    }.property('model.searchers.@each.isDone'),

    searchHits: function() {
        var contents = [];
        this.get('model.searchers').forEach(function(searcher) {
            contents.pushObjects(searcher.get('searchHits'));
        });
        return Ember.ArrayProxy.createWithMixins(Ember.SortableMixin, {
            content: contents,
            sortProperties: ['title'],
            sortAscending: true
        });
    }.property('model.searchers.@each.searchHits')
});
