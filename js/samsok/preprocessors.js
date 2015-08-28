// This file contains preprocessors. They are run on content before the actual parsing begins, to perform
// any preprocessing needed, such as transforming data or following redirects.
// The preprocessor must then execute the supplied function which triggers parsing (this is to enable
// the preprocessors to work asynchronously).

var ArenaPreprocessor = function(provider, content, func) {
    var regex = /jQuery\(function\(a\)\{a\(document\)\.ready\(function\(\)\{location\.replace\("(.*?)"\)\}\)\}\)/g;
    var match = regex.exec(content);
    if (match) {
        $.getJSON(proxyBaseUrl + "?url=" +
                encodeURIComponent(match[1]) +
                "&encoding=" + provider.get('encoding') +
                "&callback=?"
        ).done(function(data) {
            if (!data.content) {
                throw "Error getting page";
            }
            func(data.content);
        });
    } else {
        func(content);
    }
};