# apt-get -y install \
#   autoconf \
#   automake \
#   build-essential \
#   cmake \
#   git-core \
#   libass-dev \
#   libfreetype6-dev \
#   libgnutls28-dev \
#   libmp3lame-dev \
#   libsdl2-dev \
#   libtool \
#   libva-dev \
#   libvdpau-dev \
#   libvorbis-dev \
#   libxcb1-dev \
#   libxcb-shm0-dev \
#   libxcb-xfixes0-dev \
#   meson \
#   ninja-build \
#   pkg-config \
#   texinfo \
#   wget \
#   yasm \
#   zlib1g-dev\
#   libssl3 \
#   openssl libssl-dev \
#   libopus-dev

# apt -y install libunistring-dev libaom-dev libdav1d-dev

# apt-get -y install libx264-dev

# wget https://downloads.plex.tv/ffmpeg-source/plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz && mkdir ffmpeg && tar -xvzf plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz -C ffmpeg && rm plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz

cd ffmpeg/plex-media-server-ffmpeg-gpl-db205f47a68d442405e9bf9baa5e7df54df97021

./configure \
--prefix="/usr/local"  \
--enable-version3 \
--enable-gpl \
--enable-libx264 \
--enable-openssl \
--enable-libass \
--enable-libopus

make -j$(nproc)
make install