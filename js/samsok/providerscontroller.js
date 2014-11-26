App.ProvidersController = Ember.Controller.extend({
    providers: null,

    init: function() {
        this.set('providers', Ember.ArrayProxy.create({content: providers}));
    },

    allProviders: function() {
        result = [];
        if (this.get('providers')) {
            this.get('providers').forEach(function (group) {
                result.pushObjects(group.get('providers'));
            });
        }
        return result;
    }.property('providers')
});