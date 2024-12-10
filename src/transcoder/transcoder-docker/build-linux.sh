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
cd ffmpeg
git clone https://github.com/FFmpeg/nv-codec-headers -b n11.1.5.3
cd nv-codec-headers
make
make install
cd ../../

cd ffmpeg/plex-media-server-ffmpeg-gpl-db205f47a68d442405e9bf9baa5e7df54df97021

export PATH=/usr/local/cuda-12.6/bin:$PATH

./configure \
	--bindir="/usr/bin" \
	--enable-version3 \
	--enable-gpl --enable-nonfree \
	--enable-libx264 \
	--enable-libx265 \
	--enable-openssl \
	--enable-cuda-nvcc --enable-cuda-llvm --enable-cuvid --enable-nvdec --enable-nvenc --enable-ffnvcodec --extra-cflags=-I/usr/local/cuda-12.6/include --extra-ldflags=-L/usr/local/cuda-12.6/lib64 \
	--enable-libass \
	--enable-libopus

make -j$(nproc)
# make install