# The landing page in site/: static files behind nginx, nothing else.
FROM nginx:1.27-alpine
COPY deploy/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/site/headers.inc /etc/nginx/conf.d/headers.inc
COPY site/ /usr/share/nginx/html/
# Cloudflare holds css and js for hours, so the page asks for them by a hash of their content and every deploy is seen at once.
RUN cd /usr/share/nginx/html \
  && css=$(md5sum styles.css | cut -c1-10) && js=$(md5sum app.js | cut -c1-10) \
  && sed -i "s|href=\"styles.css\"|href=\"styles.css?v=$css\"|; s|src=\"app.js\"|src=\"app.js?v=$js\"|" index.html \
  && grep -q "styles.css?v=$css" index.html && grep -q "app.js?v=$js" index.html
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
