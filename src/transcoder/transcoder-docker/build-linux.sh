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

# apt -y install libunistring-dev libaom-dev libdav1d-dev libx264-dev libx265-dev

# wget https://downloads.plex.tv/ffmpeg-source/plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz && mkdir ffmpeg && tar -xvzf plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz -C ffmpeg && rm plex-media-server-ffmpeg-gpl-db205f47a6.tar.gz


git clone https://github.com/plextra/plex-ffmpeg -b release/6.1

./configure \
	--bindir="/usr/bin" \
	--enable-version3 \
	--enable-gpl --enable-nonfree \
	--enable-libx264 \
	--enable-libx265 \
	--enable-openssl \
	--enable-libass \
	--enable-libopus

make -j$(nproc)
# make install