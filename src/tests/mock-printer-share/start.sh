#!/bin/sh
# Starts the mock Windows printer share. Its user and password are the ones of src/tests/utils/mock-printer.ts
set -e
useradd --no-create-home --shell /usr/sbin/nologin "$SHARE_USERNAME" 2>/dev/null || true
printf '%s\n%s\n' "$SHARE_PASSWORD" "$SHARE_PASSWORD" | smbpasswd -a -s "$SHARE_USERNAME"
mkdir -p /var/spool/samba /jobs
chmod 1777 /var/spool/samba /jobs

# Named after the time the job arrives, so the tests can sort the jobs, and after its share
cat > /usr/local/bin/save-job <<'EOF'
#!/bin/sh
cp "$1" "/jobs/$(date +%s%N)-$2.prn" && rm "$1"
EOF
chmod +x /usr/local/bin/save-job

exec smbd --foreground --no-process-group --debug-stdout --configfile=/etc/samba/mock-printer-share.conf
