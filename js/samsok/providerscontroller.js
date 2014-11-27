App.ProvidersController = Ember.Controller.extend({
    providers: null,

    init: function() {
        this.set('providers', providers);
    },

    allProviders: function() {
        result = [];
        if (this.get('providers')) {
            this.get('providers').forEach(function (group) {
                result.pushObjects(group.get('providers'));
            });
        }
        return result;
    }.property('providers'),

    allEnabled: function(key, value) {
        if (arguments.length === 1) /* get */ {
            return this.get('allProviders').isEvery('enabled');
        } else /* set */ {
            this.get('allProviders').setEach('enabled', value);
        }
    }.property('allProviders.@each.enabled')
});