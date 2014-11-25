window.App = Ember.Application.create();

function scrollToSearchresult() {
    $('html, body').stop().animate({
        scrollTop: $("#searchresult").offset().top
    }, 1500, 'easeInOutExpo');
}

App.ScrollLinksMixin = Ember.Mixin.create({
    didInsertElement: function() {
        setupScrolling();
    }
});

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

App.IndexView = Ember.View.extend(App.ScrollLinksMixin);
