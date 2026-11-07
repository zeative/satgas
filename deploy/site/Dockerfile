# The landing page in site/: static files behind nginx, nothing else.
FROM nginx:1.27-alpine
COPY deploy/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
