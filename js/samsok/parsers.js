// These are the parsers, the functions that do all the heavy lifting.
// Note that they must be able to run both in a Web Worker thread and from
// the main thread, so any libraries they use must be referenced both from
// webworker.js and samsok.html, and all the usual restrictions for Web Workers
// apply (i.e. no document or window objects, no DOM, no Ember, no shared data, etc).

var XsearchParser = function(content, baseurl) {
    var hits = [];

    var js = JSON.parse(content)['xsearch'];
    var totalHits = js['records'];

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

    return {
        totalHits: totalHits,
        hits: hits
    };
};

var SsbParser = function(content, baseurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = $('div#results-filter p.total em').eq(2).text().trim();
    if (!totalHits)
        totalHits = "0";

    $('ol.results-icon div.row-fluid').filter(isNumeric).each(function(i, element) {
        var result = $(this);
        var title = result.find('div.title h2').text().trim();
        var author = result.find('span.author').text().trim();
        var type = result.find('span.mediatype').text().trim();
        var year = result.find('span.year').text().trim();
        var url = baseurl + result.find('div.title h2 a').attr('href');
        hits.push(
            {
                title: title,
                author: author,
                type: type,
                year: year,
                url: url
            }
        );
    });

    return {
        totalHits: totalHits,
        hits: hits
    };
};

var GotlibParser = function(content, baseurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = "0";
    var totalHitsSpan = $('span.noResultsHideMessage');
    if (totalHitsSpan.length > 0) {
        var hitsRegex = /\d+ - \d+ .*? (\d+)/g;
        var match = hitsRegex.exec(totalHitsSpan);
        if (match) {
            totalHits = match[1];
        }
    }


    $('div[class=dpBibTitle]').each(function(i, element) {
        var result = $(this);
        var title = result.find('span.title a').text().trim();
        var author = result.find('div.dpBibAuthor a').text().trim();
        var type = result.find('span.itemMediaDescription').text().trim();
        var year = result.find('span.itemMediaYear').text().trim();
        var url = baseurl + result.find('span.title a').attr("href");
        hits.push(
            {
                title: title,
                author: author,
                type: type,
                year: year,
                url: url
            }
        );
    });

    return {
        totalHits: totalHits,
        hits: hits
    };
};

var MalmoParser = function(content, baseurl, searchurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = "0";
    // Special case - if there's only one hit, it goes directly to the hit
    if (content && $('table.browseScreen').length == 0) {
        totalHits = "1";
        var title = $("td.bibInfoLabel:contains('Titel')").next("td.bibInfoData").text();
        if (title.lastIndexOf('/') > -1) {
            title = title.substr(0, title.lastIndexOf('/') + 1);
        }
        var author = $("td.bibInfoLabel:contains('Namn')").next("td.bibInfoData a").text();
        var type = $("td.media img").attr("alt");
        var year = "";
        var yearRegExp = /, (\d{4})/g;
        var match = yearRegExp.exec($("td.bibInfoLabel:contains('Utgivning')").next("td.bibInfoData").text());
        if (match) {
            year = match[1];
        }

        hits.push({
                title: title,
                author: author,
                type: type,
                year: year,
                url: searchurl
        });
    } else {
        var totalHitsSpan = $('td.browseHeaderData');
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /\d+-\d+ .*? (\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                totalHits = match[1];
            }
        }

        $('tr.briefCitRow').each(function(i, element) {
            var result = $(this);
            var titletags = $('span.briefcitTitle').parent().find('a');
            if (titletags.length > 0) {
                var title = titletags.eq(0).text().trim();
                var author = result.find('span.briefcitTitle').text().trim();
                var type = result.find('span.briefcitMedia > img').eq(0).attr('alt');
                var year = result.find('table tr td').eq(5).text().trim();
                if (year.length >= 4) {
                    year = year.substr(year.length - 4, year.length);
                    if (isNaN(year)) {
                        year = "";
                    }
                }
                var url = baseurl + titletags.eq(0).attr('href');

                hits.push(
                    {
                        title: title,
                        author: author,
                        type: type,
                        year: year,
                        url: url
                    }
                );
            }
        });
    }

    return {
        totalHits: totalHits,
        hits: hits
    };
};

var OlaParser = function(content, baseurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = "0";
    var totalHitsSpan = $('span.result-text');
    if (totalHitsSpan.length > 0) {
        var hitsRegex = / (\d+) /g;
        var match = hitsRegex.exec(totalHitsSpan);
        if (match) {
            totalHits = match[1];
        }
    }

    $('ol.search-result li.work-item').each(function(i, element) {
        var result = $(this);
        var title = result.find('h3.work-details-header a').text().trim();
        var author = result.find('div.work-details p').text().trim();
        if (author.toLowerCase().indexOf("av:") == 0) {
            author = author.substr("av:".length, author.length).trim();
        }
        var typesArray = [];
        result.find('ol.media-type-list li a span').each(function(i, t) {
            typesArray.push($(t).text().trim());
        });
        var type = typesArray.join(' / ');

        var year = result.find('h3.work-details-header small').text().trim();
        year = year.substring(1, year.length - 1);
        var url = baseurl + result.find('h3.work-details-header a').attr('href');

        hits.push(
            {
                title: title,
                author: author,
                type: type,
                year: year,
                url: url
            }
        );
    });

    return {
        totalHits: totalHits,
        hits: hits
    };
};

var KohaParser = function(content, baseurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = "0";
    var totalHitsSpan = $('p#numresults');
    if (totalHitsSpan.length > 0) {
        var hitsRegex = / (\d+) /g;
        var match = hitsRegex.exec(totalHitsSpan);
        if (match) {
            totalHits = match[1];
        }
    }

    $('td.bibliocol').each(function(i, element) {
        var result = $(this);
        var title = result.find('a.title').text().trim();
        var author = result.find('span.author').text().trim();
        var type = result.find('span.results_summary.type').text().trim();
        var publisher = result.find('span.results_summary.publisher').text().trim();
        var year = "";
        if (publisher.length >= 4 && !isNaN(publisher.substring(publisher.length - 4, publisher.length))) {
            year = publisher.substring(publisher.length - 4, publisher.length);
        }
        var url = baseurl + result.find('a.title').attr('href');

        hits.push(
            {
                title: title,
                author: author,
                type: type,
                year: year,
                url: url
            }
        );
    });

    return {
        totalHits: totalHits,
        hits: hits
    };
};

var MinabibliotekParser = function(content, baseurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = "0";
    var totalHitsSpan = $('span.result-count').first().text().trim();
    if (totalHitsSpan.length > 0) {
        totalHits = totalHitsSpan;
    }

    $('div.catalog-search-result-container > ol.search-result > li').each(function(i, element) {
        console.log("Matchar 1gng");
        var result = $(this);
        var title = result.find(':header a.work-link').text().trim();
        var author = result.find('span.author-name').text().trim();
        if (author.toLowerCase().indexOf("av:") == 0) {
            author = author.substr("av:".length, author.length).trim();
        }

        var typesArray = [];
        result.find('ul.media-types li a span').each(function(i, t) {
            typesArray.push($(t).text().trim());
        });
        var type = typesArray.join(' / ');

        var year = result.find('span.published-name').text().trim();
        var url = baseurl + result.find(':header a.work-link').attr('href');

        hits.push(
            {
                title: title,
                author: author,
                type: type,
                year: year,
                url: url
            }
        );
    });

    return {
        totalHits: totalHits,
        hits: hits
    };
};

var LibraParser = function(content, baseurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = "0";

    // Special case - many libraries go directly to the result if there's only one hit.
    if ($("td.resultlink").text().trim() != "") {
        totalHits = 1;
        var author = $("tr[class*=listline] td:contains('Författare:')").next("td").find("a").text().trim();
        var title = $("tr[class*=listline] td:contains('Titel:')").next("td").text().trim();
        var type = "";
        var year = "";
        var url = baseurl + $("a[href*=show_catalogue]").attr("href");
        hits.push(
            {
                title: title,
                author: author,
                type: type,
                year: year,
                url: url
            }
        );
    } else {
        var totalHitsSpan = $('form[name=FormPaging] b').eq(0);
        if (totalHitsSpan.length > 0) {
            var hitsRegex = /\d+ - \d+ .*? (\d+)/g;
            var match = hitsRegex.exec(totalHitsSpan);
            if (match) {
                totalHits = match[1];
            }
        }

        headers = $('form[name=FormPaging] table.list th[class*=listHeader]').map(function(i, element) {
            return $(this).text().trim().toLowerCase();
        }).get();

        $('form[name=FormPaging] table.list tr[class*=listLine]').each(function(i, element) {
            var result = $(this);

            var title;
            var url;
            if (headers.indexOf('titel') >= 0) {
                title = result.find('td').eq(headers.indexOf('titel')).find('a').text().trim();
                url = baseurl + result.find('td').eq(headers.indexOf('titel')).find('a').attr('href');
            } else {
                title = result.find('td').eq(1).find('a').text().trim();
                url = baseurl + result.find('td').eq(1).find('a').attr('href');
            }

            var author;
            if (headers.indexOf('författare') >= 0)
                author = result.find('td').eq(headers.indexOf('författare')).text().trim();
            else {
                if (!title) {
                    title = result.find('td').eq(0).find('a').text().trim();
                    author = result.find('td').eq(1).text().trim();
                } else {
                    author = result.find('td').eq(0).text().trim();
                }
            }

            var type;
            if (headers.indexOf('medietyp') >= 0)
                type = result.find('td').eq(headers.indexOf('medietyp')).find('img').attr('alt');
            else {
                type = result.find('td').eq(4).find('img').attr('alt');
                if (!type) {
                    type = result.find('td').eq(4).text().trim();
                }
            }
            var year;
            if (headers.indexOf('år') >= 0)
                year = result.find('td').eq(headers.indexOf('år')).text().trim();
            else
                year = result.find('td').eq(3).text().trim();

            hits.push(
                {
                    title: title,
                    author: author,
                    type: type,
                    year: year,
                    url: url
                }
            );
        });
    }

    return {
        totalHits: totalHits,
        hits: hits
    };
};

var MicroMarcParser = function(content, baseurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = $('span[id*=LabelSearchHeader] b').text().trim();
    if (!totalHits)
        totalHits = "0";

    $('tr[id*=RadGridHitList]').each(function(i, element) {
        var result = $(this);
        var title = result.find('td').eq(2).find('a').text().trim();
        var author = result.find('td').eq(2).children('span').eq(0).contents().slice(0, -1).not('span[style*="display: none"]').text();
        var type = result.find('td').eq(4).find('a').attr('title');
        var year = result.find('td').eq(3).text().trim();
        var url = result.find('td').eq(2).find('a').attr('href');
        if (url.indexOf('http://') != 0) {
            url = baseurl + url;
        }

        hits.push(
            {
                title: title,
                author: author,
                type: type,
                year: year,
                url: url
            }
        );
    });

    return {
        totalHits: totalHits,
        hits: hits
    };
};

ArenaParser = function(content, baseurl, searchurl) {
    var hits = [],
        $ = cheerio.load(content);

    var totalHits = "0";

    // Special case for a single hit
    if ($('div.arena-detail-title').length > 0) {
        totalHits = "1";

        var title = $("div.arena-detail-title span").eq(1).text().trim();
        var author = $("div.arena-detail-author span.arena-value").text().trim();
        var type = $("div.arena-detail-media span.arena-value").text().trim();
        var year = $("div.arena-detail-year span.arena-value").text().trim();
        var url = $("a.arena-linktopage").attr("href");
        if (!url) {
            url = searchurl;
        }

        hits.push(
            {
                title: title,
                author: author,
                type: type,
                year: year,
                url: url
            }
        );
    } else {
        totalRegex = /<span.*?">\d+-\d+ .*? (\d+)<\/span>/g;
        var totalmatch = totalRegex.exec(content);
        if (totalmatch) {
            totalHits = totalmatch[1];
        } else {
            var totalRegex = /<span class="feedbackPanelINFO">.*?(\d+).*?<\/span>/g;
            totalmatch = totalRegex.exec(content);
            if (totalmatch) {
                // Växjö displays alternative search result hits - we don't want that!
                if (totalmatch[0].indexOf('alternativa') == -1)
                    totalHits = totalmatch[1];
            }
        }

        $('div.arena-record-details').each(function(i, element) {
            var result = $(this);
            var title = result.find('div.arena-record-title a span').text().trim();
            var author = result.find('div.arena-record-author span.arena-value').text().trim();
            var type = result.find('div.arena-record-media span.arena-value').text().trim();
            var year = result.find('div.arena-record-year span.arena-value').text().trim();
            var url = result.find('div.arena-record-title a').attr('href');

            hits.push(
                {
                    title: title,
                    author: author,
                    type: type,
                    year: year,
                    url: url
                }
            );
        });
    }

    return {
        totalHits: totalHits,
        hits: hits
    };
};
