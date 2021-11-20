// This file contains preprocessors. They are run on content before the actual parsing begins, to perform
// any preprocessing needed, such as transforming data or following redirects.
// The preprocessor must then execute the supplied function which triggers parsing (this is to enable
// the preprocessors to work asynchronously).

// Many Arena libraries will use a Javascript redirect to go directly to the book page if there's only one hit.
// This preprocessor will detect and follow that redirect.
var ArenaPreprocessor = function(provider, content, func, cookies) {
    var regex = /jQuery\(function\(.*?\)\{.*?\(document\)\.ready\(function\(\)\{location\.replace\("(.*?)"\)\}\)\}\)/g;
    var match = regex.exec(content);
    if (match) {
        var newUrl = encodeURI(decodeURIComponent(match[1].replace(/\\x/g, '%')));
        $.getJSON(proxyBaseUrl + "?url=" +
                encodeURIComponent(newUrl) +
                "&encoding=" + provider.get('encoding') +
                "&cookies=" + cookies +
                "&callback=?"
        ).done(function(data) {
            if (!data.content) {
                throw "Error getting page";
            }
            
            func(data.content, match[1]);
        });
    } else {
        func(content);
    }
};

var BlockPhrasePreprocessorGenerator = function(phrase) {
    return function(provider, content, func) {
        if (content.indexOf(phrase) >= 0) {
            func("");
        } else {
            func(content);
        }
    };
};