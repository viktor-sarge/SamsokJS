function loadXml(xmlStr) {
    var parser, xmlDoc;
    if(window.DOMParser) {
        parser = new DOMParser();
        xmlDoc = parser.parseFromString(xmlStr, "text/html");
    } else {
        xmlDoc=new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async=false;
        xmlDoc.loadXML(xmlStr);
    }
    return xmlDoc;
}

function xpathString(node, expr) {
    return document.evaluate(expr, node, null, XPathResult.STRING_TYPE, null).stringValue.trim();
}

function xpathBoolean(node, expr) {
    return document.evaluate(expr, node, null, XPathResult.BOOLEAN_TYPE, null).booleanValue;
}

function xpathNodes(node, expr) {
    return document.evaluate(expr, node, null, XPathResult.ANY_TYPE, null);
}

App.XsearchParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];

        var js = jQuery.parseJSON(content)['xsearch'];
        this.set('totalHits', js['records']);

        js['list'].forEach(function(result) {
            hits.push(
                {
                    title: result['title'],
                    author: result['creator'],
                    type: result['type'],
                    year: result['date'],
                    url: result['identifier']
                }
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
                {
                    title: title,
                    author: author,
                    type: type,
                    year: year,
                    url: url
                }
            );

            result = results.iterateNext();
        }

        return hits;
    }
});

App.GotlibParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
        html = loadXml(content);

        var totalHitsSpan = xpathString(html, "//span[@class='noResultsHideMessage']");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /\d+ - \d+ .*? (\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }


        var results = xpathNodes(html, "//table[@class='browseResult']/tbody/tr");
        var result = results.iterateNext();
        while (result) {
            var isProgram = xpathBoolean(result, './/span[contains(@id, "programMediaTypeInsertComponent")]');
            if (isProgram) {
                result = results.iterateNext();
                continue;
            }

            var title = xpathString(result, ".//div[@class='dpBibTitle']");
            var author = xpathString(result, ".//div[@class='dpBibAuthor']");
            var type = xpathString(result, ".//span[@class='itemMediaDescription']");
            var year = xpathString(result, ".//span[@class='itemMediaYear']");
            var url = baseurl + xpathString(result, ".//div[@class='dpBibTitle']/a/@href");
            hits.push(
                {
                    title: title,
                    author: author,
                    type: type,
                    year: year,
                    url: url
                }
            );

            result = results.iterateNext();
        }

        return hits;
    }
});

App.MalmoParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
        html = loadXml(content);

        var totalHitsSpan = xpathString(html, "//td[@class='browseHeaderData']");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /\d+-\d+ .*? (\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }


        var results = xpathNodes(html, "//tr[@class='briefCitRow']");
        var result = results.iterateNext();
        while (result) {
            var titletags = xpathNodes(result, ".//span[@class='briefcitTitle']/../a");
            if (titletags.length == 0) {
                result = results.iterateNext();
                continue;
            }
            var titletagsFirst = titletags.iterateNext();
            title = xpathString(titletagsFirst, ".");
            var author = xpathString(result, ".//span[@class='briefcitTitle']");
            var type = xpathString(result, ".//span[@class='briefcitMedia']/img[1]/@alt");
            var year = xpathString(result, ".//table/tr/td[5]");
            if (year.length >= 4) {
                year = year.substr(year.length - 4, year.length);
                if (!isNaN(year)) {
                    year = "";
                }
            }
            var url = baseurl + xpathString(titletagsFirst, "@href");

            hits.push(
                {
                    title: title,
                    author: author,
                    type: type,
                    year: year,
                    url: url
                }
            );

            result = results.iterateNext();
        }

        return hits;
    }
});

App.OlaParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
        html = loadXml(content);

        var totalHitsSpan = xpathString(html, "//span[@class='result-text']");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /(\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }

        var results = xpathNodes(html, "//ol[@class='search-result clearfix']/li[@class='work-item clearfix']");
        var result = results.iterateNext();
        while (result) {
            title = xpathString(result, ".//h3[@class='work-details-header']/a");
            var author = xpathString(result, ".//div[@class='work-details']/p");
            if (author.toLowerCase().indexOf("av:") == 0) {
                author = author.substr("av:".length, author.length);
            }
            var types = xpathNodes(result, ".//ol[@class='media-type-list']/li/a/span");
            var typesArray = [];
            var typesIter = types.iterateNext();
            while (typesIter) {
                typesArray.push(typesIter.stringValue);
                typesIter = types.iterateNext();
            }
            var type = typesArray.join(' / ');

            var year = xpathString(result, ".//h3[@class='work-details-header']/small");
            year = year.substring(1, year.length - 1);
            var url = baseurl + xpathString(result, ".//h3[@class='work-details-header']/a/@href");

            hits.push(
                {
                    title: title,
                    author: author,
                    type: type,
                    year: year,
                    url: url
                }
            );

            result = results.iterateNext();
        }

        return hits;
    }
});