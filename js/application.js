window.App = Ember.Application.create();

App.Router.map(function() {
    this.resource('search', {path: '/search/:query'})
});

App.ApplicationController = Ember.Controller.extend({
    actions: {
        doSearch: function(query) {
            this.transitionToRoute('search', query);
        }
    }
});

App.IndexRoute = Ember.Route.extend({

});

App.SearchRoute = Ember.Route.extend({
    model: function(params) {
        var result = [];
        getChosenProviders().forEach(function(p) {
            var searcher = App.Searcher.create({
                provider: p,
                query: params.query
            });
            searcher.search();
            result.push(searcher);
        });
        return result;
    }
});

App.SearchController = Ember.ArrayController.extend({
    remainingSearchers: function() {
        return this.get('content').filter(function(searcher) {
            return !searcher.get('isDone') && !searcher.get('isFailed');
        });
    }.property('content.@each.isDone'),

    doneSearchers: function() {
        return this.get('content').filter(function(searcher) {
            return searcher.get('isDone') && !searcher.get('isFailed');
        });
    }.property('content.@each.isDone'),

    failedSearchers: function() {
        return this.get('content').filter(function(searcher) {
            return searcher.get('isDone') && searcher.get('isFailed');
        });
    }.property('content.@each.isDone'),

    searchHits: function() {
        var result = [];
        this.get('content').forEach(function (searcher) {
           result = result.concat(searcher.get('searchHits'));
        });
        return result;
    }.property('content.@each.searchHits')
});
