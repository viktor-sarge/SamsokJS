// This file contains query modifiers. They are run on the query to transform or modify it
// before using it in a search or goto URL.

// The default is to just replace encode it as a URI component.
var DefaultQueryModifier = function(query) {
    return encodeURIComponent(query);
};

// This replaces space with + and encodes the rest
var SpacetoPlusQueryModifier = function(query) {
    return query.replace(/ /g, '+');
};
