// Trim and trimLeft may not be available on MSIE - add them in that case

if(typeof String.prototype.trim !== 'function') {
    String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, '');
    }
}

if(typeof String.prototype.trimLeft !== 'function') {
    String.prototype.trimLeft = function() {
        return this.replace(/^\s+/, '');
    }
}

function isNumeric(x) {
    return !isNaN(parseFloat(x)) && isFinite(x)
}