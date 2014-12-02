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

function xpathString(doc, node, expr) {
    if (doc.evaluate)
        return doc.evaluate(expr, node, null, XPathResult.STRING_TYPE, null).stringValue.trim();
    else
        return document.evaluate(expr, node, null, XPathResult.STRING_TYPE, null).stringValue.trim();
}

function xpathBoolean(doc, node, expr) {
    if (doc.evaluate)
        return doc.evaluate(expr, node, null, XPathResult.BOOLEAN_TYPE, null).booleanValue;
    else
        return document.evaluate(expr, node, null, XPathResult.BOOLEAN_TYPE, null).booleanValue;
}

function xpathNodes(doc, node, expr) {
    if (doc.evaluate)
        return doc.evaluate(expr, node, null, XPathResult.ANY_TYPE, null);
    else
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

        var totalHits = xpathString(html, html, "//div[@id='results-filter']/p[@class='total']/em[3]");
        this.set('totalHits', totalHits);

        var results = xpathNodes(html, html, "//ol[@class='results-icon']//div[string(number(@id)) != 'NaN' and @class='row-fluid']");
        var result = results.iterateNext();
        while (result) {
            var title = xpathString(html, result, ".//div[@class='title']/h2");
            var author = xpathString(html, result, ".//span[@class='author']");
            var type = xpathString(html, result, ".//span[@class='mediatype']");
            var year = xpathString(html, result, ".//span[@class='year']");
            var url = baseurl + xpathString(html, result, ".//div[@class='title']/h2/a/@href");
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

        var totalHitsSpan = xpathString(html, html, "//span[@class='noResultsHideMessage']");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /\d+ - \d+ .*? (\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }


        var results = xpathNodes(html, html, "//table[@class='browseResult']/tbody/tr");
        var result = results.iterateNext();
        while (result) {
            var isProgram = xpathBoolean(html, result, './/span[contains(@id, "programMediaTypeInsertComponent")]');
            if (isProgram) {
                result = results.iterateNext();
                continue;
            }

            var title = xpathString(html, result, ".//div[@class='dpBibTitle']");
            var author = xpathString(html, result, ".//div[@class='dpBibAuthor']");
            var type = xpathString(html, result, ".//span[@class='itemMediaDescription']");
            var year = xpathString(html, result, ".//span[@class='itemMediaYear']");
            var url = baseurl + xpathString(html, result, ".//div[@class='dpBibTitle']/a/@href");
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

        var totalHitsSpan = xpathString(html, html, "//td[@class='browseHeaderData']");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /\d+-\d+ .*? (\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }


        var results = xpathNodes(html, html, "//tr[@class='briefCitRow']");
        var result = results.iterateNext();
        while (result) {
            var titletags = xpathNodes(html, result, ".//span[@class='briefcitTitle']/../a");
            if (titletags.length == 0) {
                result = results.iterateNext();
                continue;
            }
            var titletagsFirst = titletags.iterateNext();
            title = xpathString(html, titletagsFirst, ".");
            var author = xpathString(html, result, ".//span[@class='briefcitTitle']");
            var type = xpathString(html, result, ".//span[@class='briefcitMedia']/img[1]/@alt");
            var year = xpathString(html, result, ".//table/tr/td[5]");
            if (year.length >= 4) {
                year = year.substr(year.length - 4, year.length);
                if (isNaN(year)) {
                    year = "";
                }
            }
            var url = baseurl + xpathString(html, titletagsFirst, "@href");

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

        var totalHitsSpan = xpathString(html, html, "//span[@class='result-text']");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /(\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }

        var results = xpathNodes(html, html, "//ol[@class='search-result clearfix']/li[@class='work-item clearfix']");
        var result = results.iterateNext();
        while (result) {
            title = xpathString(html, result, ".//h3[@class='work-details-header']/a");
            var author = xpathString(html, result, ".//div[@class='work-details']/p");
            if (author.toLowerCase().indexOf("av:") == 0) {
                author = author.substr("av:".length, author.length);
            }
            var types = xpathNodes(html, result, ".//ol[@class='media-type-list']/li/a/span");
            var typesArray = [];
            var typesIter = types.iterateNext();
            while (typesIter) {
                typesArray.push(typesIter.stringValue);
                typesIter = types.iterateNext();
            }
            var type = typesArray.join(' / ');

            var year = xpathString(html, result, ".//h3[@class='work-details-header']/small");
            year = year.substring(1, year.length - 1);
            var url = baseurl + xpathString(html, result, ".//h3[@class='work-details-header']/a/@href");

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

App.KohaParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
        html = loadXml(content);

        var totalHitsSpan = xpathString(html, html, "//p[@id='numresults']");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /(\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }

        var results = xpathNodes(html, html, "//td[@class='bibliocol']");
        var result = results.iterateNext();
        while (result) {
            var title = xpathString(html, result, ".//a[@class='title']");
            var author = xpathString(html, result, ".//span[@class='author']");
            var type = xpathString(html, result, ".//span[@class='results_summary type']");

            var publisher = xpathString(html, result, ".//span[@class='results_summary publisher']")
            var year = "";
            if (publisher.length >= 4 && !isNaN(publisher.substring(publisher.length - 4, publisher.length))) {
                year = publisher.substring(publisher.length - 4, publisher.length);
            }
            var url = baseurl + xpathString(html, result, ".//a[@class='title']/@href");

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

App.MinabibliotekParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
        html = loadXml(content);

        var totalHitsSpan = xpathString(html, html, "//form[@id='SearchResultForm']/p[@class='information']");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /(\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }

        var results = xpathNodes(html, html, "//form[@id='MemorylistForm']/ol[@class='CS_list-container']/li");
        var result = results.iterateNext();
        while (result) {
            var title = xpathString(html, result, ".//h3[@class='title']/a");
            var author = xpathString(html, result, ".//p[@class='author']");
            if (author.toLowerCase().indexOf("av:") == 0) {
                author = author.substr("av:".length, author.length);
            }
            var types = xpathNodes(html, result, ".//ol[@class='media-type CS_clearfix']/li/a/span");
            var typesArray = [];
            var typesIter = types.iterateNext();
            while (typesIter) {
                typesArray.push(typesIter.stringValue);
                typesIter = types.iterateNext();
            }
            var type = typesArray.join(' / ');

            var year = xpathString(html, result, ".//span[@class='date']");
            var url = baseurl + xpathString(html, result, ".//h3[@class='title']/a/@href");

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

App.LibraParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
        html = loadXml(content);

        var totalHitsSpan = xpathString(html, html, "//form[@name='FormPaging']/b[1]");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /\d+ - \d+ .*? (\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }

        var results = xpathNodes(html, html, "//form[@name='FormPaging']/table[@class='list']/tbody/tr[contains(@class, 'listLine')]");
        var result = results.iterateNext();
        while (result) {
            var title = xpathString(html, result, ".//td[2]/a");
            var author;
            if (!title) {
                title = xpathString(html, result, ".//td[1]/a")
                author = xpathString(html, result, ".//td[2]");
            } else {
                author = xpathString(html, result, ".//td[1]");
            }
            var type = xpathString(html, result, ".//td[5]/img/@alt");
            if (!type) {
                type = xpathString(html, result, ".//td[5]");
            }
            var year = xpathString(html, result, ".//td[4]");
            var url = baseurl + xpathString(html, result, ".//td[2]/a/@href");

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

App.MicroMarcParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
        html = loadXml(content);

        var totalHitsSpan = xpathString(html, html, "//span[contains(@id, 'LabelSearchHeader')]");
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /(\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                this.set('totalHits', match[1]);
            }
        }

        var results = xpathNodes(html, html, "//tr[contains(@id, 'RadGridHitList')]");
        var result = results.iterateNext();
        while (result) {
            var title = xpathString(html, result, ".//td[3]/a");
            var author = xpathNodes(html, result, ".//td[3]/span").iterateNext().innerHTML;
            var authorRegex = /<br>(.*?)<span/g;
            var match = authorRegex.exec(author);
            if (match) {
                author = match[1];
            } else {
                author = "";
            }
            var type = xpathString(html, result, ".//td[5]/a/@title");
            var year = xpathString(html, result, ".//td[4]");
            var url = baseurl + xpathString(html, result, ".//td[3]/a/@href");

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

App.ArenaParser = Ember.Object.extend({
    totalHits: null,

    getHits: function(content, baseurl) {
        var hits = [];
        html = loadXml(content);


        var totalRegex = /<span class="feedbackPanelINFO">.*?(\d+).*?<\/span>/g;
        var totalmatch = totalRegex.exec(content);
        if (totalmatch) {
            this.set('totalHits', totalmatch[1]);
        } else {
            totalRegex = /<span.*?">\d+-\d+ .*? (\d+)<\/span>/g;
            totalmatch = totalRegex.exec(content);
            if (totalmatch) {
                this.set('totalHits', totalmatch[1]);
            }
        }

        var results = xpathNodes(html, html, "//div[@class='arena-record-details']");
        var result = results.iterateNext();
        while (result) {
            var title = xpathString(html, result, ".//div[@class='arena-record-title']/a/span");
            var author = xpathString(html, result, ".//div[@class='arena-record-author']/span[@class='arena-value']");
            var type = xpathString(html, result, ".//div[@class='arena-record-media']/span[@class='arena-value']");
            var year = xpathString(html, result, ".//div[@class='arena-record-year']/span[@class='arena-value']");
            var url = xpathString(html, result, ".//div[@class='arena-record-title']/a/@href");

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