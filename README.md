SamsokJS
================

A Javascript based rewrite of our federated searching "Samsök". 

Installation
------------

No installation necessary! SamsokJS runs completely in the browsser, and need only be deployed as is. It can even run directly from the file system without a server.

Server side proxy
-----------------

Because of the Same Origin Policy for JavaScript in the browser, a proxy that can retrieve pages and return them as JSONP is required. A simple Python-based proxy has been developed for this project and can be found [here](https://github.com/regionbibliotekhalland/SamsokProxy). There is a publicly available instance running on Google App Engine at the following URL: http://samsokproxy.appspot.com/crossdomain (this address is already hardcoded into SamsokJS).

Developer notes
---------------

There is a dependency on [Cheerio](https://github.com/cheeriojs/cheerio) which is used to be able to process HTML data with jQuery-like syntax even in web worker threads (where the browser DOM is unavailable). Because Cheerio is a NodeJS module, it must be run through [Browserify](http://browserify.org) in order to be used in this project. The following syntax can be used to regenerate the cheerio.browserified.js file:

`browserify index.js --standalone cheerio > cheerio.browserified.js`

Also, at the time of writing (Dec 8th 2014) the following bug had to be manually patched to get Cheerio to run in browserified mode: https://github.com/cheeriojs/cheerio/issues/549

After patching the bug the code should also be minified using any minification library.
