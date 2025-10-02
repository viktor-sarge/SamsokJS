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
    var hits = [];
    var totalHits = "0";

    // Check if we have GraphQL JSON data (direct API response)
    try {
        var data = JSON.parse(content);
        if (data && data.data && data.data.searchWithFilter) {
            var searchData = data.data.searchWithFilter;
            totalHits = searchData.totalHits ? searchData.totalHits.toString() : "0";
            
            console.log("Stockholm parser: Processing GraphQL response with " + totalHits + " total results");
            
            // Process all media containers (Books, E-books, Audio books, etc.)
            if (searchData.groupedMedia && Array.isArray(searchData.groupedMedia)) {
                searchData.groupedMedia.forEach(function(container) {
                    if (container.mediaList && Array.isArray(container.mediaList)) {
                        container.mediaList.forEach(function(item) {
                            if (!item.title) return;
                            
                            // Extract publication year from publishedDate
                            var year = "";
                            if (item.publishedDate) {
                                var yearMatch = item.publishedDate.match(/\d{4}/);
                                if (yearMatch) {
                                    year = yearMatch[0];
                                }
                            }
                            
                            // Clean up author name
                            var author = item.author || "";
                            if (author) {
                                // Remove common suffixes like "John Ronald Reuel Tolkien" -> "John Ronald Reuel Tolkien"
                                author = author.replace(/\s+$/, ''); // trim trailing spaces
                            }
                            
                            // Use mediaTypeDisplay for type
                            var type = item.mediaTypeDisplay || "";
                            
                            // Create URL to the item page
                            var itemUrl = baseurl + 'titel/' + item.key;
                            
                            hits.push({
                                title: item.title,
                                author: author,
                                type: type,
                                year: year,
                                url: itemUrl
                            });
                        });
                    }
                });
            }
            
            return {
                totalHits: totalHits,
                hits: hits
            };
        }
    } catch (e) {
        // Not JSON data, continue to HTML parsing
    }

    // Check if this is the new Next.js system and extract embedded data
    if (content.indexOf('__NEXT_DATA__') !== -1) {
        console.log("Stockholm parser: Next.js application detected, extracting embedded data");
        
        try {
            // Extract the Next.js data from the script tag
            var nextDataMatch = content.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
            if (nextDataMatch) {
                var nextData = JSON.parse(nextDataMatch[1]);
                
                // Navigate to the search results in the Next.js data structure
                if (nextData && nextData.props && nextData.props.pageProps && nextData.props.pageProps.searchResults) {
                    var searchResults = nextData.props.pageProps.searchResults;
                    
                    if (searchResults.totalHits !== undefined) {
                        totalHits = searchResults.totalHits.toString();
                        console.log("Stockholm parser: Found " + totalHits + " results in Next.js data");
                        
                        // Process the search results
                        if (searchResults.groupedMedia && Array.isArray(searchResults.groupedMedia)) {
                            searchResults.groupedMedia.forEach(function(container) {
                                if (container.mediaList && Array.isArray(container.mediaList)) {
                                    container.mediaList.forEach(function(item) {
                                        if (!item.title) return;
                                        
                                        // Extract publication year from publishedDate
                                        var year = "";
                                        if (item.publishedDate) {
                                            var yearMatch = item.publishedDate.match(/\d{4}/);
                                            if (yearMatch) {
                                                year = yearMatch[0];
                                            }
                                        }
                                        
                                        // Clean up author name
                                        var author = item.author || "";
                                        if (author) {
                                            author = author.replace(/\s+$/, ''); // trim trailing spaces
                                        }
                                        
                                        // Use mediaTypeDisplay for type
                                        var type = item.mediaTypeDisplay || "";
                                        
                                        // Create URL to the item page
                                        var itemUrl = baseurl + 'titel/' + item.key;
                                        
                                        hits.push({
                                            title: item.title,
                                            author: author,
                                            type: type,
                                            year: year,
                                            url: itemUrl
                                        });
                                    });
                                }
                            });
                        }
                        
                        return {
                            totalHits: totalHits,
                            hits: hits
                        };
                    }
                }
            }
        } catch (e) {
            console.log("Stockholm parser: Error extracting Next.js data:", e.message);
        }
        
        // If we can't extract data from Next.js, return empty results
        console.log("Stockholm parser: Could not extract search data from Next.js page");
        return {
            totalHits: "0",
            hits: []
        };
    }

    // Legacy parser code for old system
    var $ = cheerio.load(content);
    var legacyTotalHits = $('div#results-filter p.total em').eq(2).text().trim();
    if (!legacyTotalHits)
        legacyTotalHits = "0";

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
        totalHits: legacyTotalHits,
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
    var hits = [];
    var totalHits = "0";
    
    // Check if we have JSON data (from MalmoPreprocessor)
    try {
        var data = JSON.parse(content);
        if (data && data.data && Array.isArray(data.data)) {
            totalHits = data.totalResults ? data.totalResults.toString() : data.data.length.toString();
            
            console.log("Malmö parser: Processing " + data.data.length + " results from JSON API");
            
            data.data.forEach(function(item) {
                if (!item.title) return;
                
                // Extract author from primaryAgent
                var author = "";
                if (item.primaryAgent && item.primaryAgent.label) {
                    author = item.primaryAgent.label;
                    // Clean up author format (remove years and extra info)
                    author = author.replace(/, \d{4}-\d{4}\.?$/, '');
                    author = author.replace(/, \d{4}-\.?$/, '');
                    author = author.replace(/\([^)]+\)/, '').trim();
                }
                
                // Get publication year
                var year = item.publicationDate || "";
                if (year && year.indexOf('-') !== -1) {
                    // Handle date ranges like "2002-2009"
                    year = year.split('-')[0];
                }
                
                // Determine material type from available formats
                var type = "";
                if (item.materialTabs && item.materialTabs.length > 0) {
                    var types = item.materialTabs.map(function(tab) {
                        return tab.name;
                    });
                    type = types.join(', ');
                }
                
                // Create URL to the item page (correct format)
                var itemUrl = baseurl + 'search/card?id=' + item.id + '&entityType=' + item.entityType;
                
                hits.push({
                    title: item.title,
                    author: author,
                    type: type,
                    year: year,
                    url: itemUrl
                });
            });
            
            return {
                totalHits: totalHits,
                hits: hits
            };
        }
    } catch (e) {
        console.log("Malmö parser: Error parsing JSON data:", e.message);
    }
    
    // Fallback: Check if this is the Angular SPA HTML
    if (content && (content.indexOf('bc-app') !== -1 || content.indexOf('Loading...') !== -1)) {
        console.log("Malmö parser: Angular SPA detected - preprocessor should handle this");
        return {
            totalHits: "0", 
            hits: []
        };
    }
    
    // Default fallback
    console.log("Malmö parser: Unknown content format");
    return {
        totalHits: "0",
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
    var totalHitsSpan = $('#numresults');
    if (totalHitsSpan.length > 0) {
        var hitsRegex = / (\d+) result/g;
        var match = hitsRegex.exec(totalHitsSpan);
        if (match) {
            totalHits = match[1];
        }
    }

    // Special case - many libraries go directly to the result if there's only one hit.
    var singleTitleElement = $("h1.title, h2.title").first();
    if (singleTitleElement.length > 0 && singleTitleElement.text().trim() !== "") {
        totalHits = "1";

        var titleNode = singleTitleElement.clone();
        titleNode.find('span.title_resp_stmt').remove();
        var title = titleNode.text().split('/')[0].trim();

        var authorList = $("span.results_summary.author").first().find('ul.resource_list li');
        var author = authorList.map(function() {
            var text = $(this).text().trim();
            return text.replace(/\s*\[[^\]]*\]\s*$/, '');
        }).get().join('; ');
        if (!author) {
            author = $("span[property='author'] span[property='name']").map(function() {
                return $(this).text().trim();
            }).get().join('; ');
        }

        var type = $("span.results_summary.type img.materialtype").attr('alt');
        if (!type) {
            type = $("span.results_summary.type").text().trim();
        }

        var year = $("span.rda264_date").first().text().trim();
        if (!year) {
            var recordText = $("div.record").text();
            var yearMatch = /(\d{4})/.exec(recordText);
            if (yearMatch) {
                year = yearMatch[1];
            }
        }

        var view_link = $("a[href*=show_catalogue]").attr("href") || $("a#ISBDview").attr("href");
        var url = view_link ? baseurl.replace(/\/$/, '') + view_link : baseurl;
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
    }

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

    var totalHits = "okänt";

    // Special case for a single hit
    if ($('div.arena-detail-title').length > 0) {
        totalHits = "1";

        var titleSpan = $("div.arena-detail-title span").filter(function() {
            var cls = $(this).attr('class') || '';
            return cls.indexOf('arena-result-item-number') === -1 && cls.indexOf('mediaclass-label') === -1;
        }).last();
        var title = titleSpan.length > 0 ? titleSpan.text().trim() : $("div.arena-detail-title").text().trim();
        var author = $("div.arena-detail-author span.arena-value").text().trim();
        var type = $("div.arena-detail-media span.arena-value").text().trim();
        var year = $("div.arena-detail-year span.arena-value").text().trim();

        var url = $("link[rel='canonical']").attr("href") || $("a.arena-linktopage").attr("href");
        if (url && baseurl && url.indexOf('http') !== 0) {
            url = baseurl.replace(/\/$/, '') + url;
        }
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
        var feedbackText = $('div.arena-feedback').text().trim().toLowerCase();
        if (feedbackText.indexOf('gav inga träffar') !== -1 || feedbackText.indexOf('gav 0 träffar') !== -1) {
            return {
                totalHits: "0",
                hits: []
            };
        }

        var totalRegex = /<h2 class="feedbackPanelINFO">.*?(\d+).*?<\/h2>/g;
        var totalmatch = totalRegex.exec(content);

        if (totalmatch) {
            // Check for 'alternativa' in the content and ignore if present
            if (totalmatch[0].indexOf('alternativa') === -1) {
                totalHits = totalmatch[1];
            }
        } else {
            totalRegex = /<span.*?">\d+-\d+ .*? (\d+)<\/span>/g;
            totalmatch = totalRegex.exec(content);

            if (totalmatch) {
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
