FROM caddy:2.10-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html styles.css /srv/site/
COPY assets /srv/site/assets
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
