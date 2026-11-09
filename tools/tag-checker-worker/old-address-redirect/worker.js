// Old address of the Mosspit Tag Checker for Etsy. Forwards every visit to the new address.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    return Response.redirect("https://tag-checker.mosspit.workers.dev" + url.pathname + url.search, 301);
  },
};
