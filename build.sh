docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/plextra/plex-ffmpeg --push .
docker buildx build --platform linux/amd64,linux/arm64 . -t ghcr.io/plextra/realtime-transcoder --push