FROM debian
RUN apt update
RUN apt-get -y install \
  autoconf \
  automake \
  build-essential \
  cmake \
  git-core \
  libass-dev \
  libfreetype6-dev \
  libgnutls28-dev \
  libmp3lame-dev \
  libsdl2-dev \
  libtool \
  libva-dev \
  libvdpau-dev \
  libvorbis-dev \
  libxcb1-dev \
  libxcb-shm0-dev \
  libxcb-xfixes0-dev \
  meson \
  ninja-build \
  pkg-config \
  texinfo \
  wget \
  yasm \
  zlib1g-dev\
  libssl3 \
  openssl libssl-dev

RUN apt -y install libunistring-dev libaom-dev libdav1d-dev
RUN apt-get -y install libx264-dev libx265-dev

RUN wget https://downloads.plex.tv/ffmpeg-source/plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz && mkdir ffmpeg && tar -xvzf plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz -C ffmpeg && rm plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz

RUN mkdir -p /opt/ffmpeg/bin
ENV PATH="/opt/ffmpeg/bin:$PATH"
ENV PKG_CONFIG_PATH="/opt/ffmpeg/lib/pkgconfig"

ARG PREFIX=/opt/ffmpeg
ARG PKG_CONFIG_PATH=/opt/ffmpeg/lib/pkgconfig
ARG LD_LIBRARY_PATH=/opt/ffmpeg/lib
ARG MAKEFLAGS="-j$(nproc)"

ARG OPUS_VERSION=v1.5.2
#Build opus
WORKDIR /opt/sources/opus
#https://github.com/xiph/opus/commit/bce1f392353d72d77d543bb2069a044ae1045e9d Latest commit
RUN git clone --branch ${OPUS_VERSION} https://github.com/xiph/opus .
RUN ./autogen.sh
RUN ./configure --prefix="${PREFIX}" --disable-shared --enable-static --disable-dependency-tracking
RUN make -j$(nproc)
RUN make install

WORKDIR /ffmpeg/plex-media-server-ffmpeg-gpl-db205f47a68d442405e9bf9baa5e7df54df97021
RUN ./configure \
--prefix="${PREFIX}" \
--extra-cflags="-I${PREFIX}/include" \
--extra-ldflags="-L${PREFIX}/lib" \
--extra-ldexeflags="-Bstatic" \
--extra-ldflags="-L${PREFIX}/lib -Wl,-z,stack-size=2097152" \
--extra-libs="-lpthread -lm" \
--bindir="${PREFIX}/bin" \
--enable-version3 \
--enable-gpl \
--enable-libx264 \
--enable-libx265 \
--enable-openssl \
--enable-libass \
--enable-libopus
RUN make -j$(nproc)
RUN make install