# syntax=docker/dockerfile:1

FROM rust:1-bookworm AS builder
WORKDIR /app

# Cache Rust dependencies in a separate layer
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src migrations \
    && echo "fn main() {}" > src/main.rs \
    && touch migrations/001_init.sql \
    && cargo build --release --locked \
    && cargo clean --release --locked -p starward-backend \
    && rm -rf src migrations

# Build the real application binary
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=${APP_VERSION}
COPY build.rs ./build.rs
COPY migrations ./migrations
COPY src ./src
RUN touch build.rs src/main.rs migrations/001_init.sql \
    && cargo build --release --locked

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home starward

ARG APP_VERSION=0.0.0-dev

WORKDIR /app
COPY --from=builder /app/target/release/starward-backend /usr/local/bin/starward-backend

ENV HOST=0.0.0.0
ENV PORT=8080
ENV RUST_LOG=starward_backend=info,tower_http=info
ENV APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="Starward Backend" \
      org.opencontainers.image.description="Starward Password Manager - Rust Axum encrypted vault backend" \
      org.opencontainers.image.version="${APP_VERSION}"

USER starward
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

CMD ["/usr/local/bin/starward-backend"]
