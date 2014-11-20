var searchIdCounter = 0;

function loadXml(xmlStr) {
    var parser, xmlDoc;
    if(window.DOMParser) {
        parser = new DOMParser();
        xmlDoc = parser.parseFromString(xmlStr, "text/xml");
    } else {
        xmlDoc=new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async=false;
        xmlDoc.loadXML(xmlStr);
    }
    return xmlDoc;
}

function xpathString(node, expr) {
    return document.evaluate(expr, node, null, XPathResult.STRING_TYPE, null).stringValue;
}

function xpathNodes(node, expr) {
    return document.evaluate(expr, node, null, XPathResult.ANY_TYPE, null);
}

App.SearchHit = Ember.Object.extend({
    title: null,
    author: null,
    type: null,
    year: null,
    url: null
});

App.XsearchParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];

        // YQL gives us some crap around the JSON that we need to remove
        content = content.replace(/^[^{]*/mg, '');
        content = content.replace(/[^}]*$/mg, '');

        var js = jQuery.parseJSON(content)['xsearch'];
        this.set('totalHits', js['records']);

        js['list'].forEach(function(result) {
            hits.push(
                App.SearchHit.create({
                    title: result['title'],
                    author: result['creator'],
                    type: result['type'],
                    year: result['date'],
                    url: result['identifier']
                })
            );
        });

        return hits;
    }
});

App.SsbParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
            html = loadXml(content);

        var totalHits = xpathString(html, "//div[@id='results-filter']/p[@class='total']/em[3]");

        this.set('totalHits', totalHits);

        var results = xpathNodes(html, "//ol[@class='results-icon']//div[string(number(@id)) != 'NaN' and @class='row-fluid']");
        var result = results.iterateNext();
        while (result) {
            var title = xpathString(result, ".//div[@class='title']/h2");
            var author = xpathString(result, ".//span[@class='author']");
            var type = xpathString(result, ".//span[@class='mediatype']");
            var year = xpathString(result, ".//span[@class='year']");
            var url = baseurl + xpathString(result, ".//div[@class='title']/h2/a/@href");
            hits.push(
                App.SearchHit.create({
                    title: title,
                    author: author,
                    type: type,
                    year: year,
                    url: url
                })
            );
            result = results.iterateNext();
        }

        return hits;
    }
});