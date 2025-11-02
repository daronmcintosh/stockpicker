FROM n8nio/n8n:latest

# Copy startup script and workflows
COPY start-n8n.sh /start-n8n.sh
COPY workflows /tmp/workflows

# Set permissions for startup script
USER root
RUN chmod +x /start-n8n.sh && \
    chown node:node /start-n8n.sh
USER node

# Use tini with our startup script (preserve signal handling from base image)
ENTRYPOINT ["tini", "--"]
CMD ["/start-n8n.sh"]


