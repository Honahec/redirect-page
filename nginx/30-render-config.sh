#!/bin/sh
set -eu

ENABLE_HTTPS="${ENABLE_HTTPS:-false}"
SERVER_NAME="${SERVER_NAME:-_}"
TLS_CERT_FILE="${TLS_CERT_FILE:-mycert.pem}"
TLS_KEY_FILE="${TLS_KEY_FILE:-mycert-key.pem}"
CONFIG_PATH="/etc/nginx/conf.d/default.conf"

if [ "$ENABLE_HTTPS" = "true" ]; then
  CERT_PATH="/etc/nginx/certs/$TLS_CERT_FILE"
  KEY_PATH="/etc/nginx/certs/$TLS_KEY_FILE"

  if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
    echo "HTTPS is enabled but certificate files are missing." >&2
    echo "Expected: $CERT_PATH and $KEY_PATH" >&2
    exit 1
  fi

  cat > "$CONFIG_PATH" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $SERVER_NAME;

  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name $SERVER_NAME;

  ssl_certificate $CERT_PATH;
  ssl_certificate_key $KEY_PATH;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 1d;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
EOF
else
  cat > "$CONFIG_PATH" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $SERVER_NAME;

  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
EOF
fi
