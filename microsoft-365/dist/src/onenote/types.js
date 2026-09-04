/**
 * OneNote resource shapes, per Microsoft Graph.
 *
 * OneNote is delegated-only across the whole surface — Graph's own docs state
 * plainly that the OneNote API does not support application (app-only)
 * authentication. Every call here runs as the signed-in person, same as the
 * rest of this server; there is no "background OneNote job" mode and there
 * will not be one, because Graph does not offer it.
 */
export {};
//# sourceMappingURL=types.js.map